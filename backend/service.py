"""Interview orchestration.

Owns the sequence the agents run in and the state transitions between them.
The route handlers stay thin: they validate, call one of these two functions,
and translate exceptions into status codes.

Agents never call each other. Everything they share moves through the session
record, which is what keeps each one independently testable and lets a new
agent be inserted without touching the others.

Every LLM call is dispatched with `asyncio.to_thread`. The Gemini SDK is
synchronous, and calling it directly from an async handler would block the
event loop for the full 3-15 seconds — meaning one interview in progress would
stall every other request on the worker.
"""

import asyncio
from typing import Any, Dict, Optional

from agents import evaluator, feedback, interviewer, planner
from config import MAX_QUESTIONS, MIN_QUESTIONS, MIN_TOPICS
from core import session as session_state
from core.session import SessionNotFound, session_store
from logging_config import get_logger
from models import Evaluation, InterviewResponse

logger = get_logger("service")


class InterviewAlreadyFinished(RuntimeError):
    """A turn arrived for a session that has already produced feedback."""


def _current_target(session: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    plan = session.get("interview_plan") or []
    index = session.get("current_plan_index", 0)
    return plan[index] if 0 <= index < len(plan) else (plan[-1] if plan else None)


async def start_interview(session_id: str, candidate: Dict[str, Any]) -> InterviewResponse:
    """First request of a session: plan the interview and open it."""
    session = await session_store.create(session_id, candidate)

    # Planner is pure Python plus vector lookups, but the embedding query is
    # still CPU work — keep it off the event loop like everything else.
    profile, plan = await asyncio.to_thread(planner.create_plan, candidate)
    session["profile"] = profile
    session["interview_plan"] = plan

    turn = await asyncio.to_thread(interviewer.generate_turn, session, None, True)

    target = _current_target(session)
    session_state.add_message(session, "assistant", turn.reply)
    session_state.record_question(
        session,
        turn.curriculum_day,
        turn.reply,
        (target or {}).get("question_id"),
    )
    await session_store.save(session)

    logger.info(
        "interview started",
        extra={
            "event": "interview.start",
            "session_id": session_id,
            "candidate": profile.get("candidate_id"),
            "archetype": profile.get("archetype"),
            "difficulty": profile.get("difficulty"),
            "plan_targets": len(plan),
        },
    )
    return InterviewResponse(reply=turn.reply, done=False)


async def continue_interview(session_id: str, message: str) -> InterviewResponse:
    """Every subsequent request: evaluate, respond, and decide whether to end."""
    session = await session_store.get(session_id)  # raises SessionNotFound

    if session.get("status") == session_state.STATUS_COMPLETED:
        raise InterviewAlreadyFinished(session_id)

    answer = (message or "").strip() or "[The candidate did not say anything.]"
    session_state.add_message(session, "user", answer)

    target = _current_target(session)
    last_day = session.get("last_question_day") or (
        target["curriculum_day"] if target else 0
    )

    # AGENT 2 — assess the answer. Runs first so the interviewer receives a
    # verdict rather than forming one while writing its own next question.
    evaluation: Evaluation = await asyncio.to_thread(
        evaluator.evaluate,
        session.get("last_question_text") or "",
        answer,
        target,
        last_day,
        session.get("question_count", 0),
    )
    session["answer_evaluations"].append(evaluation.model_dump())

    # AGENT 3 — decide what to say next.
    turn = await asyncio.to_thread(interviewer.generate_turn, session, evaluation, False)

    asked = session.get("question_count", 0)
    topics = len(session.get("topics_covered") or [])
    must_end = asked >= MAX_QUESTIONS
    may_end = asked >= MIN_QUESTIONS and topics >= MIN_TOPICS
    should_end = must_end or (may_end and turn.is_closing)

    session_state.add_message(session, "assistant", turn.reply)

    if should_end:
        # AGENT 4 — the closing assessment.
        assessment = await asyncio.to_thread(feedback.generate, session)
        session["status"] = session_state.STATUS_COMPLETED
        await session_store.save(session)

        logger.info(
            "interview completed",
            extra={
                "event": "interview.complete",
                "session_id": session_id,
                "questions": asked,
                "topics": topics,
                "forced": must_end and not turn.is_closing,
            },
        )
        return InterviewResponse(reply=turn.reply, done=True, feedback=assessment)

    next_target = _current_target(session)

    # Coverage is tracked from the *plan* rather than the model's self-report
    # whenever the interviewer moved to a new topic. The reported day is only a
    # claim about what it just asked, and a model that keeps naming the same day
    # would freeze `topics_covered` — which silently forces every interview to
    # run to the question ceiling instead of ending once coverage is met.
    # A follow-up genuinely stays on the previous topic, so it keeps that day.
    coverage_day = turn.curriculum_day
    if not turn.is_followup and next_target:
        coverage_day = next_target["curriculum_day"]

    session_state.record_question(
        session,
        coverage_day,
        turn.reply,
        None if turn.is_followup else (next_target or {}).get("question_id"),
    )
    interviewer.advance_plan(session, turn)
    await session_store.save(session)

    return InterviewResponse(reply=turn.reply, done=False)


async def handle(
    session_id: str,
    candidate: Optional[Dict[str, Any]] = None,
    message: Optional[str] = None,
) -> InterviewResponse:
    """Route one request to the right phase.

    A request carrying a candidate starts a session; one carrying a message
    continues it. Restarting an existing session id is treated as a genuine
    restart rather than an error — the client owns session ids and a page
    reload should not strand the user.
    """
    if candidate is not None:
        return await start_interview(session_id, candidate)
    if message is None:
        raise ValueError("Request must include either 'candidate' (to start) or 'message'.")
    return await continue_interview(session_id, message)


__all__ = [
    "start_interview",
    "continue_interview",
    "handle",
    "InterviewAlreadyFinished",
    "SessionNotFound",
]
