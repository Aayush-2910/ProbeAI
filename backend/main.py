"""ProbeAI — FastAPI app exposing the single interview endpoint."""

import json
import logging
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import conversation_engine
import feedback_generator
import interview_planner
from config import CANDIDATES_PATH, FRONTEND_DIST, GEMINI_MODEL
from curriculum import curriculum
from llm_client import LLMError
from models import InterviewRequest, InterviewResponse
from session_manager import session_manager

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("probeai")

app = FastAPI(
    title="ProbeAI",
    description="AI-powered adaptive technical interviewer for the 31-day AI Engineering Cohort.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_candidates() -> List[Dict[str, Any]]:
    try:
        with open(CANDIDATES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        logger.warning("candidates.json not found at %s", CANDIDATES_PATH)
        return []


CANDIDATES = _load_candidates()


@app.get("/health")
@app.get("/api/health")
async def health() -> Dict[str, Any]:
    """Health check.

    Lives at /health rather than / because the built frontend owns the root —
    a judge opening the URL must get the app, not JSON. When no frontend build
    exists, / is registered as this same handler at the bottom of the file.
    """
    return {
        "status": "ok",
        "app": "ProbeAI",
        "model": GEMINI_MODEL,
        "curriculum_days": len(curriculum.all_days()),
        "candidates": len(CANDIDATES),
        "active_sessions": len(session_manager.list_sessions()),
    }


@app.get("/api/candidates")
async def list_candidates() -> List[Dict[str, Any]]:
    """All sample candidate profiles, for the frontend dropdown."""
    return CANDIDATES


@app.post("/api/interview", response_model=InterviewResponse, response_model_exclude_none=True)
async def interview(request: InterviewRequest) -> InterviewResponse:
    try:
        # CASE 1 — new session: the client sent the full candidate profile.
        if request.candidate is not None:
            candidate = request.candidate.model_dump(exclude_none=True)
            session = session_manager.create_session(request.sessionId, candidate)
            session["interview_plan"] = interview_planner.create_plan(candidate, curriculum)

            logger.info(
                "session %s started for %s (%s) — %d planned targets",
                request.sessionId,
                candidate.get("member", {}).get("name"),
                candidate.get("member", {}).get("jobRole"),
                len(session["interview_plan"]),
            )

            opening = conversation_engine.generate_opening(session)
            return InterviewResponse(reply=opening, done=False)

        # CASE 2 — ongoing conversation.
        if request.message is None:
            raise HTTPException(
                status_code=400,
                detail="Request must include either 'candidate' (to start) or 'message' (to continue).",
            )

        session = session_manager.get_session(request.sessionId)
        if session["status"] == "completed":
            raise HTTPException(
                status_code=409,
                detail=f"Interview '{request.sessionId}' has already finished.",
            )

        result = conversation_engine.process_turn(session, request.message)

        # CASE 3 — interview complete.
        if result.should_end:
            feedback = feedback_generator.generate(session)
            session["status"] = "completed"
            logger.info(
                "session %s completed — %d questions across %d days",
                request.sessionId,
                session["question_count"],
                len(session["topics_covered"]),
            )
            return InterviewResponse(reply=result.reply, done=True, feedback=feedback)

        return InterviewResponse(reply=result.reply, done=False)

    except LLMError as exc:
        logger.error("LLM failure on session %s: %s", request.sessionId, exc)
        raise HTTPException(status_code=503, detail=f"Interviewer is unavailable: {exc}") from exc


# Mounted LAST so it cannot shadow the API routes, and guarded so the backend
# still starts before anyone has run `npm run build`.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
    logger.info("serving built frontend from %s", FRONTEND_DIST)
else:
    # API-only mode: keep the root answering so health checks still work.
    app.add_api_route("/", health, methods=["GET"])
    logger.info("no frontend build at %s — API only (run `npm run build`)", FRONTEND_DIST)
