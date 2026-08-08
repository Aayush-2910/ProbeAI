"""MCP server — ProbeAI's interview capabilities for external clients.

Demonstrates the Model Context Protocol from the other side: MCP is both a
topic candidates are interviewed about and a protocol this product speaks.

Exposes:
    tools       start_interview, answer_question, get_feedback,
                retrieve_curriculum, get_candidate_signal
    resources   probeai://candidates, probeai://curriculum

Run standalone over stdio, from the backend/ directory:

    python mcp_server.py

Written against MCP SDK 2.x, which configures a server by passing `on_*`
handlers to the constructor. The 1.x decorator API (`@server.list_tools()`)
and `FastMCP` do not exist in 2.x — if you are following an older tutorial,
that is why it does not match.

One caveat worth stating plainly: a stdio server is its own process with its
own memory, so interviews started here are invisible to the HTTP API and vice
versa. Sharing them would need the Supabase session backend, at which point
both processes read the same rows.
"""

import asyncio
import json
from typing import Any, Dict

import logging_config

logging_config.configure()
logger = logging_config.get_logger("mcp")

from core.candidates import candidates  # noqa: E402
from core.curriculum import curriculum  # noqa: E402
from core.session import SessionNotFound  # noqa: E402
from rag.vector_store import vector_store  # noqa: E402
from tools import registry  # noqa: E402

SERVER_NAME = "probeai"

CANDIDATES_URI = "probeai://candidates"
CURRICULUM_URI = "probeai://curriculum"

# Read-only subset of the internal registry. `check_coverage` and
# `evaluate_answer` stay internal: both need session state that an external
# client has no business naming.
SHARED_TOOLS = ("retrieve_curriculum", "get_candidate_signal")


def _require_mcp():
    try:
        import mcp.types as types
        from mcp.server import Server
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "The MCP server needs the 'mcp' package. Install it with "
            "`pip install mcp`, or just run the HTTP API — MCP is an optional "
            "surface, not a requirement for the interview endpoint."
        ) from exc
    return Server, types


def _build_server() -> Any:
    Server, types = _require_mcp()
    from service import continue_interview, start_interview

    def text_result(payload: Any, is_error: bool = False):
        return types.CallToolResult(
            content=[types.TextContent(text=json.dumps(payload, indent=2, default=str))],
            is_error=is_error,
        )

    # --- resources ----------------------------------------------------------

    async def on_list_resources(ctx, params):
        return types.ListResourcesResult(
            resources=[
                types.Resource(
                    uri=CANDIDATES_URI,
                    name="Candidate profiles",
                    description=f"All {len(candidates)} candidate profiles with mission history.",
                    mime_type="application/json",
                ),
                types.Resource(
                    uri=CURRICULUM_URI,
                    name="Cohort curriculum",
                    description="The full 31-day curriculum: modules, objectives and tools.",
                    mime_type="application/json",
                ),
            ]
        )

    async def on_read_resource(ctx, params):
        uri = str(params.uri)
        if uri == CANDIDATES_URI:
            body = json.dumps(candidates.all(), indent=2)
        elif uri == CURRICULUM_URI:
            body = json.dumps(curriculum.raw, indent=2)
        else:
            raise ValueError(f"Unknown resource: {uri}")

        return types.ReadResourceResult(
            contents=[
                types.TextResourceContents(uri=params.uri, text=body, mime_type="application/json")
            ]
        )

    # --- tools --------------------------------------------------------------

    async def on_list_tools(ctx, params):
        tools = [
            types.Tool(
                name="start_interview",
                description=(
                    "Begin an interview for a candidate id such as CAND-003. Returns the "
                    "interviewer's opening message and the session id to pass to answer_question."
                ),
                input_schema={
                    "type": "object",
                    "properties": {
                        "candidate_id": {"type": "string", "description": "Candidate id, e.g. CAND-003."},
                        "session_id": {"type": "string", "description": "Optional; derived from the candidate id if omitted."},
                    },
                    "required": ["candidate_id"],
                },
            ),
            types.Tool(
                name="answer_question",
                description="Submit the candidate's answer and get the interviewer's next message.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "session_id": {"type": "string"},
                        "answer": {"type": "string"},
                    },
                    "required": ["session_id", "answer"],
                },
            ),
            types.Tool(
                name="get_feedback",
                description="Return coverage and structured feedback for a completed interview.",
                input_schema={
                    "type": "object",
                    "properties": {"session_id": {"type": "string"}},
                    "required": ["session_id"],
                },
            ),
        ]

        for schema in registry.TOOL_SCHEMAS:
            if schema["name"] in SHARED_TOOLS:
                parameters = json.loads(json.dumps(schema["parameters"]))
                if schema["name"] == "get_candidate_signal":
                    # No session over MCP, so the candidate must be named.
                    parameters["properties"]["candidate_id"] = {
                        "type": "string", "description": "Candidate id, e.g. CAND-003.",
                    }
                    parameters["required"] = ["candidate_id", "day"]
                tools.append(
                    types.Tool(
                        name=schema["name"],
                        description=schema["description"],
                        input_schema=parameters,
                    )
                )

        return types.ListToolsResult(tools=tools)

    async def on_call_tool(ctx, params):
        from core.session import session_store

        name = params.name
        arguments: Dict[str, Any] = dict(params.arguments or {})

        try:
            if name == "start_interview":
                candidate = candidates.get(arguments["candidate_id"])
                if candidate is None:
                    return text_result(
                        {"error": f"Unknown candidate '{arguments['candidate_id']}'.",
                         "available": candidates.ids()},
                        is_error=True,
                    )
                session_id = arguments.get("session_id") or f"mcp-{arguments['candidate_id']}"
                response = await start_interview(session_id, candidate)
                return text_result(
                    {"session_id": session_id, "reply": response.reply, "done": response.done}
                )

            if name == "answer_question":
                response = await continue_interview(arguments["session_id"], arguments["answer"])
                payload: Dict[str, Any] = {"reply": response.reply, "done": response.done}
                if response.feedback:
                    payload["feedback"] = response.feedback.model_dump()
                return text_result(payload)

            if name == "get_feedback":
                session = await session_store.get(arguments["session_id"])
                if session.get("status") != "completed":
                    return text_result(
                        {"error": "Interview is still in progress.",
                         "coverage": registry.check_coverage(session)},
                        is_error=True,
                    )
                return text_result(registry.check_coverage(session))

            if name == "get_candidate_signal":
                candidate = candidates.get(arguments.get("candidate_id", "")) or {}
                if not candidate:
                    return text_result(
                        {"error": "candidate_id is required and must be known.",
                         "available": candidates.ids()},
                        is_error=True,
                    )
                return text_result(registry.get_candidate_signal(candidate, arguments["day"]))

            if name in SHARED_TOOLS:
                return text_result(registry.dispatch(name, arguments))

            return text_result({"error": f"Unknown tool '{name}'."}, is_error=True)

        except SessionNotFound:
            return text_result(
                {"error": f"No session '{arguments.get('session_id')}'. Call start_interview first."},
                is_error=True,
            )
        except KeyError as exc:
            return text_result({"error": f"Missing required argument: {exc}"}, is_error=True)

    return Server(
        SERVER_NAME,
        version="2.0.0",
        title="ProbeAI",
        instructions=(
            "Conducts adaptive technical interviews for graduates of a 31-day AI "
            "Engineering cohort. Start with start_interview, then call answer_question "
            "for each reply until done is true."
        ),
        on_list_resources=on_list_resources,
        on_read_resource=on_read_resource,
        on_list_tools=on_list_tools,
        on_call_tool=on_call_tool,
    )


async def main() -> None:  # pragma: no cover - process entry point
    from mcp.server.stdio import stdio_server

    await asyncio.to_thread(vector_store.build)
    server = _build_server()

    logger.info(
        "mcp server ready",
        extra={"event": "mcp.startup", "candidates": len(candidates),
               "curriculum_days": len(curriculum.all_days())},
    )

    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":  # pragma: no cover
    asyncio.run(main())
