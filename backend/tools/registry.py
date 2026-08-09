"""Function-calling tools.

Four capabilities the system exposes as callable tools rather than burying in a
prompt. Each is a plain Python function with a JSON-schema declaration, so the
same definition serves three consumers:

    * a tool-calling LLM turn (Gemini or Groq — `as_gemini` / `as_openai`)
    * the MCP server, for external clients
    * the agents themselves, called directly as ordinary functions

Keeping the implementations provider-agnostic is the point. A tool is a
capability of the product; the wire format it is advertised in is not.
"""

from typing import Any, Callable, Dict, List, Optional

from config import MAX_QUESTIONS, MIN_QUESTIONS, MIN_TOPICS, RAG_TOP_K
from core.curriculum import curriculum
from logging_config import get_logger
from rag.vector_store import vector_store

logger = get_logger("tools")


# --- Implementations --------------------------------------------------------


def retrieve_curriculum(topic: str, top_k: int = RAG_TOP_K, day: Optional[int] = None) -> Dict[str, Any]:
    """Semantic search over the 31-day curriculum."""
    rows = vector_store.query_curriculum(
        topic, top_k=max(1, min(int(top_k), 20)), days=[int(day)] if day else None
    )
    return {
        "query": topic,
        "results": [
            {
                "day": row["metadata"].get("day"),
                "title": row["metadata"].get("title"),
                "module": row["metadata"].get("module"),
                "kind": row["metadata"].get("kind"),
                "text": row["text"],
                "score": row.get("score"),
            }
            for row in rows
        ],
    }


def check_coverage(session: Dict[str, Any]) -> Dict[str, Any]:
    """Whether the interview has met its exit conditions.

    Takes the session record rather than an id so it stays usable from inside
    an agent without reaching back through the store.
    """
    asked = session.get("question_count", 0)
    covered = sorted(session.get("topics_covered") or [])
    minimum_met = asked >= MIN_QUESTIONS and len(covered) >= MIN_TOPICS

    return {
        "question_count": asked,
        "questions_required": MIN_QUESTIONS,
        "questions_ceiling": MAX_QUESTIONS,
        "topics_covered": covered,
        "topics_required": MIN_TOPICS,
        "minimum_met": minimum_met,
        "should_end": asked >= MAX_QUESTIONS or minimum_met,
        "must_end": asked >= MAX_QUESTIONS,
    }


def get_candidate_signal(candidate: Dict[str, Any], day: int) -> Dict[str, Any]:
    """How this candidate performed on one specific curriculum day."""
    from agents.planner import ASSUMES_FOR_PRIORITY, PRIORITY_BLIND_SPOT, classify_mission

    day = int(day)
    for mission in candidate.get("missions") or []:
        if int(mission.get("day", -1)) == day:
            priority, signal = classify_mission(mission)
            return {
                "day": day,
                "title": curriculum.get_title(day),
                "module": curriculum.get_module(day),
                "attempted": True,
                "passed": mission.get("passed"),
                "attempts": mission.get("attempts"),
                "skipped": bool(mission.get("skipped")),
                "priority": priority,
                "signal": signal,
                "safe_to_assume": ASSUMES_FOR_PRIORITY[priority],
            }

    return {
        "day": day,
        "title": curriculum.get_title(day),
        "module": curriculum.get_module(day),
        "attempted": False,
        "passed": None,
        "attempts": None,
        "skipped": False,
        "priority": PRIORITY_BLIND_SPOT,
        "signal": "never attempted this day",
        # The field that stops a tool-calling model asking someone to walk
        # through work they never did.
        "safe_to_assume": "none",
    }


def evaluate_answer(question: str, answer: str, topic_context: str = "") -> Dict[str, Any]:
    """Score one answer. Delegates to the Evaluator agent."""
    from agents.evaluator import evaluate

    evaluation = evaluate(question, answer, {"looks_for": topic_context} if topic_context else None)
    return evaluation.model_dump()


# --- Declarations -----------------------------------------------------------

# JSON Schema per tool. `session` and `candidate` are passed by the caller, not
# by the model, so they are absent from these parameter schemas.
TOOL_SCHEMAS: List[Dict[str, Any]] = [
    {
        "name": "retrieve_curriculum",
        "description": (
            "Search the 31-day AI Engineering curriculum for objectives, tools and "
            "context relevant to a topic. Use before asking a question so it can "
            "reference what was actually taught."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "Topic or concept to search for."},
                "top_k": {"type": "integer", "description": "How many results to return (default 5)."},
                "day": {"type": "integer", "description": "Restrict to one curriculum day, 1-31."},
            },
            "required": ["topic"],
        },
    },
    {
        "name": "check_coverage",
        "description": (
            "Report how many questions have been asked and which curriculum days are "
            "covered, and whether the interview may end. Call before deciding to close."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_candidate_signal",
        "description": (
            "Get this candidate's record for one curriculum day: passed, attempts, or "
            "skipped, plus safe_to_assume, which states whether you may ask what they "
            "built ('built'), what went wrong ('studied'), or must stay hypothetical "
            "('none'). Never ask how they implemented something when safe_to_assume "
            "is 'none'."
        ),
        "parameters": {
            "type": "object",
            "properties": {"day": {"type": "integer", "description": "Curriculum day, 1-31."}},
            "required": ["day"],
        },
    },
    {
        "name": "evaluate_answer",
        "description": (
            "Assess the quality of a candidate's answer. Returns quality, the points "
            "they covered, what they missed, and whether a follow-up is warranted."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The question that was asked."},
                "answer": {"type": "string", "description": "The candidate's answer."},
                "topic_context": {"type": "string", "description": "What a strong answer covers."},
            },
            "required": ["question", "answer"],
        },
    },
]

IMPLEMENTATIONS: Dict[str, Callable[..., Any]] = {
    "retrieve_curriculum": retrieve_curriculum,
    "check_coverage": check_coverage,
    "get_candidate_signal": get_candidate_signal,
    "evaluate_answer": evaluate_answer,
}


def as_openai() -> List[Dict[str, Any]]:
    """OpenAI/Groq tool format."""
    return [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["parameters"],
            },
        }
        for tool in TOOL_SCHEMAS
    ]


def as_gemini() -> List[Dict[str, Any]]:
    """Gemini function-declaration format."""
    return [{"function_declarations": [dict(tool) for tool in TOOL_SCHEMAS]}]


def dispatch(
    name: str,
    arguments: Dict[str, Any],
    session: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Execute a tool call by name.

    Session-scoped arguments are injected here rather than accepted from the
    model — a model that could name its own session or candidate would be able
    to read another interview's state.
    """
    implementation = IMPLEMENTATIONS.get(name)
    if implementation is None:
        return {"error": f"Unknown tool '{name}'. Available: {', '.join(IMPLEMENTATIONS)}"}

    arguments = dict(arguments or {})
    session = session or {}

    try:
        if name == "check_coverage":
            return implementation(session)
        if name == "get_candidate_signal":
            return implementation(session.get("candidate") or {}, arguments.get("day"))
        return implementation(**arguments)
    except TypeError as exc:
        return {"error": f"Invalid arguments for '{name}': {exc}"}
    except Exception as exc:  # noqa: BLE001 — a tool fault must not kill the turn
        logger.error(
            "tool execution failed",
            extra={"event": "tools.failed", "tool": name, "error": str(exc)},
            exc_info=True,
        )
        return {"error": f"Tool '{name}' failed: {exc}"}
