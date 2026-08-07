"""In-memory session store.

No database by design — the hackathon build keeps every interview in a plain
dict keyed by sessionId. Restarting the server drops all sessions.
"""

from typing import Any, Dict, List

from fastapi import HTTPException


class SessionManager:
    def __init__(self) -> None:
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def create_session(self, session_id: str, candidate: Dict[str, Any]) -> Dict[str, Any]:
        session: Dict[str, Any] = {
            "session_id": session_id,
            "candidate": candidate,
            "interview_plan": [],
            "conversation_history": [],   # [{"role": "assistant"|"user", "content": str}]
            "question_count": 0,
            "topics_covered": set(),      # curriculum day numbers
            "last_question_day": None,    # day the most recent question targeted
            "answer_evaluations": [],     # [{"day": int, "quality": str, "followup": bool}]
            "status": "active",
        }
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Dict[str, Any]:
        session = self._sessions.get(session_id)
        if session is None:
            raise HTTPException(
                status_code=404,
                detail=f"No interview session found for sessionId '{session_id}'. "
                       f"Start one by sending a candidate profile.",
            )
        return session

    def exists(self, session_id: str) -> bool:
        return session_id in self._sessions

    def update_session(self, session_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        session = self.get_session(session_id)
        session.update(updates)
        return session

    # --- convenience mutators used by the conversation engine ---------------

    def append_message(self, session: Dict[str, Any], role: str, content: str) -> None:
        session["conversation_history"].append({"role": role, "content": content})

    def record_question(self, session: Dict[str, Any], day: int) -> None:
        session["question_count"] += 1
        if day:
            session["topics_covered"].add(int(day))
            session["last_question_day"] = int(day)

    def record_evaluation(self, session: Dict[str, Any], evaluation: Dict[str, Any]) -> None:
        session["answer_evaluations"].append(evaluation)

    def list_sessions(self) -> List[str]:
        return list(self._sessions.keys())


# Module-level singleton shared by the FastAPI app.
session_manager = SessionManager()
