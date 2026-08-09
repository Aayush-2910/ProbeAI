"""AGENT 4 — THE FEEDBACK AGENT. Runs once, when the interview ends.

Reads the full transcript plus every stored evaluation and produces the
structured assessment the API contract requires:
    { summary, strengths[], gaps[], next[] }

The hard requirement is specificity. Generic feedback ("good understanding of
AI concepts", "keep practising") is worthless to the candidate and is the
default an LLM reaches for, so the prompt bans it by example and the output is
validated afterwards. A response that fails validation is retried once with the
failure quoted back; if it still fails, a deterministic fallback assembled from
the stored evaluations is returned instead of nothing.
"""

from typing import Any, Dict, List

from pydantic import BaseModel

from config import FEEDBACK_TEMPERATURE
from core.curriculum import curriculum
from core.llm import LLMError, generate_json
from logging_config import get_logger
from models import FeedbackModel

logger = get_logger("agent.feedback")

# Validation bounds. Enough items to be useful, few enough to stay readable.
MIN_STRENGTHS, MAX_STRENGTHS = 2, 5
MIN_GAPS, MAX_GAPS = 1, 4
MIN_NEXT, MAX_NEXT = 2, 5
MIN_SUMMARY_WORDS = 15

# Phrases that mark an item as generic. Any hit fails validation and triggers
# the corrective retry.
BANNED_PHRASES = (
    "good understanding",
    "solid grasp",
    "keep practicing",
    "keep practising",
    "needs to study more",
    "could go deeper",
    "read more documentation",
    "study more",
    "practice more",
    "strong foundation in ai",
    "familiar with the concepts",
)


class _FeedbackPayload(BaseModel):
    summary: str
    strengths: List[str]
    gaps: List[str]
    next: List[str]


SYSTEM_PROMPT = """You are an interview evaluator. You are given the complete transcript of a technical interview with a candidate who just finished a 31-day AI Engineering cohort, plus the per-answer assessments recorded during the interview.

Produce a structured assessment of the CANDIDATE only.

HARD REQUIREMENTS:
- Every single point must reference an actual moment from the transcript: something they said, an example they gave, a question they could not answer, or a term they used incorrectly.
- Quote or closely paraphrase their own words where it helps.
- Be honest. If an answer was thin, say so plainly and specifically. Do not inflate.
- Judge only the transcript. Never mention attempt counts, skipped missions, scores or profile data as evidence — the candidate never saw any of that.
- Address the candidate in second person where it reads naturally. Professional and constructive.

BANNED — any of these is an automatic failure:
- Vague praise: "good understanding of AI concepts", "solid grasp of fundamentals".
- Vague criticism: "needs to study more", "could go deeper".
- Useless advice: "keep practising", "read more documentation".

GOOD EXAMPLES:
- strength: "Explained cosine similarity versus dot product with a concrete healthcare-document example, and correctly noted that normalisation makes them equivalent."
- gap: "Could not articulate when to use fine-tuning versus RAG, falling back on 'it depends' without naming a single criterion even after a direct follow-up."
- next: "Build a decision matrix for fine-tuning versus prompting versus RAG with real thresholds — dataset size, how often the knowledge changes, latency budget, cost per 1k requests."

Return JSON only:
{
  "summary": "2-3 sentences on their technical depth and readiness, grounded in the interview",
  "strengths": ["2-5 specific strengths, each tied to a moment in the interview"],
  "gaps": ["1-4 specific gaps, each tied to a moment in the interview"],
  "next": ["2-5 concrete, actionable recommendations"]
}"""


def _render_transcript(history: List[Dict[str, str]]) -> str:
    lines = []
    for message in history:
        speaker = "INTERVIEWER" if message.get("role") in ("assistant", "model") else "CANDIDATE"
        lines.append(f"{speaker}: {message.get('content', '')}")
    return "\n\n".join(lines)


def _render_evaluations(evaluations: List[Dict[str, Any]]) -> str:
    if not evaluations:
        return "No per-answer assessments were recorded."

    lines = []
    for index, evaluation in enumerate(evaluations, start=1):
        day = evaluation.get("curriculum_day") or 0
        title = curriculum.get_title(day) if day else "unknown topic"
        line = f"Answer {index} (Day {day} — {title}): {evaluation.get('quality', '?')}"
        if evaluation.get("missing_concepts"):
            line += " | missed: " + "; ".join(evaluation["missing_concepts"][:3])
        lines.append(line)
    return "\n".join(lines)


def validate(feedback: FeedbackModel) -> List[str]:
    """Return a list of problems. Empty means the output is acceptable."""
    problems: List[str] = []

    if len(feedback.summary.split()) < MIN_SUMMARY_WORDS:
        problems.append(f"summary is too short (needs at least {MIN_SUMMARY_WORDS} words)")

    for field, values, low, high in (
        ("strengths", feedback.strengths, MIN_STRENGTHS, MAX_STRENGTHS),
        ("gaps", feedback.gaps, MIN_GAPS, MAX_GAPS),
        ("next", feedback.next, MIN_NEXT, MAX_NEXT),
    ):
        if not (low <= len(values) <= high):
            problems.append(f"{field} has {len(values)} items, needs between {low} and {high}")

    everything = " ".join(
        [feedback.summary, *feedback.strengths, *feedback.gaps, *feedback.next]
    ).lower()
    for phrase in BANNED_PHRASES:
        if phrase in everything:
            problems.append(f'contains banned generic phrase: "{phrase}"')

    return problems


def _to_model(raw: Dict[str, Any]) -> FeedbackModel:
    def string_list(value: Any) -> List[str]:
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip()]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
        return []

    return FeedbackModel(
        summary=str(raw.get("summary") or "").strip() or "Assessment unavailable.",
        strengths=string_list(raw.get("strengths")),
        gaps=string_list(raw.get("gaps")),
        next=string_list(raw.get("next")),
    )


def _fallback(session: Dict[str, Any]) -> FeedbackModel:
    """Deterministic assessment built from the stored evaluations.

    Used only when the model call fails or cannot produce valid output. It is
    honest about being degraded rather than dressing up thin data as a review.
    """
    evaluations = session.get("answer_evaluations") or []
    name = (session.get("profile") or {}).get("name", "The candidate")

    def label(days: List[int]) -> List[str]:
        seen, out = set(), []
        for day in days:
            if day and day not in seen:
                seen.add(day)
                out.append(f"Day {day} — {curriculum.get_title(day)}")
        return out

    strong = label([e.get("curriculum_day") for e in evaluations if e.get("quality") == "strong"])
    weak = label([
        e.get("curriculum_day") for e in evaluations
        if e.get("quality") in ("weak", "no_answer")
    ])
    missing = [c for e in evaluations for c in (e.get("missing_concepts") or [])][:4]

    return FeedbackModel(
        summary=(
            f"{name} answered {session.get('question_count', 0)} questions across "
            f"{len(session.get('topics_covered') or [])} curriculum areas. The automated reviewer "
            "was unavailable, so this reflects only the per-answer signals captured during the "
            "interview rather than a full assessment."
        ),
        strengths=[f"Answered in depth on {item}" for item in strong]
        or ["No answer was scored as strong during this interview."],
        gaps=[f"Answers stayed surface-level on {item}" for item in weak]
        or ["No clear gaps were flagged during the interview."],
        next=[f"Revisit {concept} and be able to explain it with a worked example." for concept in missing]
        or [f"Rebuild {item.split(' — ')[-1]} end to end, writing down each decision and why."
            for item in weak[:3]]
        or ["Re-run this interview to get a full assessment."],
    )


def generate(session: Dict[str, Any]) -> FeedbackModel:
    """Produce the closing assessment. Never raises."""
    history = session.get("conversation_history") or []
    evaluations = session.get("answer_evaluations") or []

    from agents.planner import summarize_plan

    base_content = "\n\n".join(
        [
            f"WHAT THE INTERVIEWER WAS PROBING FOR\n{summarize_plan(session.get('interview_plan') or [])}",
            f"PER-ANSWER ASSESSMENTS RECORDED DURING THE INTERVIEW\n{_render_evaluations(evaluations)}",
            f"FULL TRANSCRIPT\n{_render_transcript(history)}",
            "Now produce the assessment JSON.",
        ]
    )

    messages = [{"role": "user", "content": base_content}]

    for attempt in (1, 2):
        try:
            raw = generate_json(
                SYSTEM_PROMPT, messages, FEEDBACK_TEMPERATURE,
                response_schema=_FeedbackPayload, label=f"feedback:{attempt}",
            )
            feedback = _to_model(raw)
        except LLMError as exc:
            logger.warning(
                "feedback call failed",
                extra={"event": "feedback.error", "attempt": attempt, "error": str(exc)},
            )
            break

        problems = validate(feedback)
        if not problems:
            logger.info(
                "feedback generated",
                extra={
                    "event": "feedback.ok",
                    "attempt": attempt,
                    "strengths": len(feedback.strengths),
                    "gaps": len(feedback.gaps),
                    "next": len(feedback.next),
                },
            )
            return feedback

        logger.warning(
            "feedback failed validation",
            extra={"event": "feedback.invalid", "attempt": attempt, "problems": problems},
        )
        if attempt == 1:
            # Quote the specific failures back rather than just asking again —
            # a bare retry tends to reproduce the same generic output.
            messages = [
                {"role": "user", "content": base_content},
                {"role": "assistant", "content": str(raw)},
                {
                    "role": "user",
                    "content": (
                        "That output was rejected for these reasons:\n"
                        + "\n".join(f"- {p}" for p in problems)
                        + "\n\nRewrite it. Every item must name something specific the candidate "
                        "actually said in the transcript above. Return JSON only."
                    ),
                },
            ]

    logger.warning("using fallback feedback", extra={"event": "feedback.fallback"})
    return _fallback(session)
