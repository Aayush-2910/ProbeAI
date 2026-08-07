"""Pydantic schemas for the ProbeAI API contract."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# --- Candidate profile ------------------------------------------------------


class Member(BaseModel):
    """Identity + calibration signals for the candidate."""

    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    jobRole: str
    yearsExperience: int = 0
    education: Optional[str] = None
    status: Optional[str] = None


class Mission(BaseModel):
    """One curriculum day the candidate attempted (or skipped)."""

    model_config = ConfigDict(extra="allow")

    day: int
    title: Optional[str] = None
    passed: Optional[bool] = None
    attempts: Optional[int] = None
    skipped: Optional[bool] = None


class Signals(BaseModel):
    """Aggregate engagement signals across the cohort."""

    model_config = ConfigDict(extra="allow")

    commitDays: Optional[int] = None
    missionsCompleted: Optional[int] = None
    missionsFirstTry: Optional[int] = None


class Candidate(BaseModel):
    model_config = ConfigDict(extra="allow")

    member: Member
    missions: List[Mission] = Field(default_factory=list)
    signals: Signals = Field(default_factory=Signals)


# --- API contract -----------------------------------------------------------


class InterviewRequest(BaseModel):
    """A single request to POST /api/interview.

    `candidate` is present only on the first request of a session.
    `message` is present on every subsequent request.
    """

    sessionId: str
    candidate: Optional[Candidate] = None
    message: Optional[str] = None


class FeedbackModel(BaseModel):
    summary: str
    strengths: List[str] = Field(default_factory=list)
    gaps: List[str] = Field(default_factory=list)
    next: List[str] = Field(default_factory=list)


class InterviewResponse(BaseModel):
    reply: str
    done: bool = False
    feedback: Optional[FeedbackModel] = None


# --- Internal (not part of the public contract) -----------------------------


class TurnMeta(BaseModel):
    """Structured metadata the interviewer LLM returns alongside its reply.

    Used purely for progress tracking; never shown to the candidate.
    """

    model_config = ConfigDict(extra="ignore")

    reply: str
    curriculum_day: int = 0
    is_followup: bool = False
    answer_quality: str = "unclear"
    is_closing: bool = False


class TurnResult(BaseModel):
    """What conversation_engine hands back to main.py each turn."""

    reply: str
    should_end: bool = False
    meta: Optional[Dict[str, Any]] = None
