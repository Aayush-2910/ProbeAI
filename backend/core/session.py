"""Interview session state and storage.

The store is an interface with swappable backends because the deployment shape
demands it: an in-process dict is correct for one Render worker and silently
wrong for two, since requests round-robin and a session created on worker A is
invisible to worker B. Supabase slots in behind the same interface when the
service needs to scale past a single process.

Methods are async even though the memory implementation never awaits anything.
That is deliberate — a Supabase-backed store does real network I/O, and
retrofitting async through every call site later is far more disruptive than
carrying it from the start.
"""

import asyncio
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from config import (
    COMPLETED_SESSION_TTL_MINUTES,
    SESSION_CLEANUP_INTERVAL_SECONDS,
    SESSION_TTL_MINUTES,
)
from logging_config import get_logger

logger = get_logger("session")

STATUS_ACTIVE = "active"
STATUS_COMPLETED = "completed"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def new_session(session_id: str, candidate: Dict[str, Any]) -> Dict[str, Any]:
    """A fresh session record.

    `topics_covered` is a sorted list rather than a set so the record stays
    JSON-serialisable — the Supabase backend has to round-trip this whole dict
    through a jsonb column.
    """
    timestamp = _now()
    return {
        "session_id": session_id,
        "candidate": candidate,
        "profile": {},              # set by the planner (candidate archetype)
        "interview_plan": [],       # set by the planner
        "conversation_history": [], # [{"role": "assistant"|"user", "content": str}]
        "question_count": 0,
        "topics_covered": [],       # curriculum day numbers
        "asked_question_ids": [],   # bank question ids already used
        "last_question_day": None,
        "last_question_text": None,
        "answer_evaluations": [],   # one Evaluation per candidate answer
        "current_plan_index": 0,
        "status": STATUS_ACTIVE,
        "created_at": timestamp.isoformat(),
        "last_activity": timestamp.isoformat(),
    }


def touch(session: Dict[str, Any]) -> None:
    session["last_activity"] = _now().isoformat()


def is_expired(session: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    """Completed sessions are kept briefly to absorb late-arriving requests."""
    now = now or _now()
    try:
        last = datetime.fromisoformat(session["last_activity"])
    except (KeyError, ValueError):
        return True
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)

    minutes = (
        COMPLETED_SESSION_TTL_MINUTES
        if session.get("status") == STATUS_COMPLETED
        else SESSION_TTL_MINUTES
    )
    return now - last > timedelta(minutes=minutes)


def add_message(session: Dict[str, Any], role: str, content: str) -> None:
    session["conversation_history"].append({"role": role, "content": content})


def record_question(
    session: Dict[str, Any],
    day: Optional[int],
    question_text: str = "",
    question_id: Optional[str] = None,
) -> None:
    session["question_count"] += 1
    if day:
        day = int(day)
        if day not in session["topics_covered"]:
            session["topics_covered"].append(day)
            session["topics_covered"].sort()
        session["last_question_day"] = day
    if question_text:
        session["last_question_text"] = question_text
    if question_id and question_id not in session["asked_question_ids"]:
        session["asked_question_ids"].append(question_id)


# --- Storage ----------------------------------------------------------------


class SessionNotFound(KeyError):
    """No session exists for the given id (or it expired)."""


class SessionStore(ABC):
    name = "abstract"

    @abstractmethod
    async def create(self, session_id: str, candidate: Dict[str, Any]) -> Dict[str, Any]: ...

    @abstractmethod
    async def get(self, session_id: str) -> Dict[str, Any]: ...

    @abstractmethod
    async def save(self, session: Dict[str, Any]) -> None: ...

    @abstractmethod
    async def delete(self, session_id: str) -> None: ...

    @abstractmethod
    async def active_count(self) -> int: ...

    @abstractmethod
    async def cleanup(self) -> int:
        """Remove expired sessions. Returns how many were dropped."""


class MemorySessionStore(SessionStore):
    """Process-local storage. Correct only with a single worker."""

    name = "memory"

    def __init__(self) -> None:
        self._sessions: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def create(self, session_id: str, candidate: Dict[str, Any]) -> Dict[str, Any]:
        session = new_session(session_id, candidate)
        async with self._lock:
            self._sessions[session_id] = session
        return session

    async def get(self, session_id: str) -> Dict[str, Any]:
        session = self._sessions.get(session_id)
        if session is None:
            raise SessionNotFound(session_id)
        if is_expired(session):
            async with self._lock:
                self._sessions.pop(session_id, None)
            raise SessionNotFound(session_id)
        return session

    async def save(self, session: Dict[str, Any]) -> None:
        touch(session)
        async with self._lock:
            # The memory store hands out live references, so this is a no-op in
            # practice. It still has to exist: every other backend needs the
            # write, and call sites must not depend on aliasing.
            self._sessions[session["session_id"]] = session

    async def delete(self, session_id: str) -> None:
        async with self._lock:
            self._sessions.pop(session_id, None)

    async def active_count(self) -> int:
        return sum(
            1 for s in self._sessions.values() if s.get("status") == STATUS_ACTIVE
        )

    async def cleanup(self) -> int:
        now = _now()
        async with self._lock:
            expired = [
                sid for sid, s in self._sessions.items() if is_expired(s, now)
            ]
            for session_id in expired:
                self._sessions.pop(session_id, None)
        if expired:
            logger.info(
                "expired sessions removed",
                extra={"event": "session.cleanup", "removed": len(expired)},
            )
        return len(expired)


def build_store() -> SessionStore:
    """Pick the backend from configuration.

    Supabase is deliberately not wired up yet — an unfinished remote backend
    that silently falls back would be worse than one that is honestly absent.
    """
    from config import SESSION_BACKEND

    if SESSION_BACKEND == "supabase":
        logger.warning(
            "supabase session backend not implemented yet; using memory",
            extra={"event": "session.backend_fallback", "requested": "supabase"},
        )
    return MemorySessionStore()


session_store: SessionStore = build_store()


async def cleanup_loop() -> None:
    """Background task: drop stale sessions so memory does not grow forever."""
    while True:
        await asyncio.sleep(SESSION_CLEANUP_INTERVAL_SECONDS)
        try:
            await session_store.cleanup()
        except Exception:  # noqa: BLE001 — a cleanup failure must not kill the task
            logger.error("session cleanup failed", extra={"event": "session.cleanup_failed"},
                         exc_info=True)
