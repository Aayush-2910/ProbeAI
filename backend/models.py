"""Pydantic schemas.

Two groups live here:
  * the public API contract, fixed by technical-spec.md — do not rename fields;
  * internal models passed between agents, free to change.

Every candidate-facing model allows extra keys. The hackathon supplies the
candidate object and may extend it; unknown fields should ride along, not 422.
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# --- Candidate profile (shape defined by the supplied candidates.json) -------


class Member(BaseModel):
    """Identity and the signals used to calibrate difficulty."""

    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    jobRole: str = "unknown"
    yearsExperience: int = 0
    education: Optional[str] = None
    status: Optional[str] = None


class Mission(BaseModel):
    """One curriculum day the candidate attempted or skipped.

    A skipped mission carries only `day`, `title` and `skipped: true` — no
    `passed`, no `attempts` — so both must stay optional.
    """

    model_config = ConfigDict(extra="allow")

    day: int
    title: Optional[str] = None
    passed: Optional[bool] = None
    attempts: Optional[int] = None
    skipped: Optional[bool] = None


class Signals(BaseModel):
    model_config = ConfigDict(extra="allow")

    commitDays: Optional[int] = None
    missionsCompleted: Optional[int] = None
    missionsFirstTry: Optional[int] = None


class Candidate(BaseModel):
    model_config = ConfigDict(extra="allow")

    member: Member
    missions: List[Mission] = Field(default_factory=list)
    signals: Signals = Field(default_factory=Signals)


# --- Public API contract ----------------------------------------------------


class InterviewRequest(BaseModel):
    """A single POST /api/interview call.

    `candidate` appears only on the first request of a session; `message` on
    every one after it.
    """

    sessionId: str = Field(min_length=1)
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


# --- Internal: planner ------------------------------------------------------

Priority = Literal[
    "CRITICAL",     # skipped the day entirely
    "HIGH",         # attempted and failed
    "MEDIUM-HIGH",  # passed, but needed 4+ attempts
    "MEDIUM",       # passed on attempt 2-3
    "BLIND-SPOT",   # never appears in the missions list
    "LOW",          # passed first try
    "SYNTHESIS",    # the closing big-picture question
]

Difficulty = Literal["foundational", "implementation", "architecture"]


class PlanTarget(BaseModel):
    """One planned question: what to ask about, how hard, and why."""

    order: int
    curriculum_day: int
    module: str = ""
    topic_title: str
    priority: Priority
    difficulty_level: Difficulty
    objectives_to_probe: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    candidate_signal: str = ""
    suggested_question: str = ""
    role: str = "probe"  # "opening" | "probe" | "synthesis"

    # Retrieved from the question bank. `assumes` is derived from the mission
    # priority, which is what stops a skipped day producing "walk me through
    # how you built it".
    question_id: Optional[str] = None
    assumes: str = "none"
    followup: str = ""
    looks_for: str = ""

    # Filled by the RAG layer: curriculum text retrieved for this topic.
    retrieved_context: List[str] = Field(default_factory=list)


# --- Internal: evaluator ----------------------------------------------------

AnswerQuality = Literal["strong", "adequate", "weak", "no_answer"]


class Evaluation(BaseModel):
    """The Evaluator Agent's read on one candidate answer.

    This agent assesses only. It never produces the next question.
    """

    model_config = ConfigDict(extra="ignore")

    quality: AnswerQuality
    key_points_mentioned: List[str] = Field(default_factory=list)
    missing_concepts: List[str] = Field(default_factory=list)
    follow_up_needed: bool = False
    reasoning: str = ""

    # Bookkeeping, set by the caller rather than the model.
    curriculum_day: int = 0
    question_number: int = 0


# --- Internal: interviewer --------------------------------------------------


class InterviewerTurn(BaseModel):
    """Structured output from the Interviewer Agent."""

    model_config = ConfigDict(extra="ignore")

    reply: str
    curriculum_day: int = 0
    is_followup: bool = False
    is_closing: bool = False


class TurnResult(BaseModel):
    """What the interview service hands back to the route handler."""

    reply: str
    should_end: bool = False
    meta: Dict[str, Any] = Field(default_factory=dict)
