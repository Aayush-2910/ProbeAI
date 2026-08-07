"""FINAL ASSESSMENT.

Runs once, when the interview ends. Makes a separate LLM call over the full
transcript and returns structured, specific feedback.
"""

from typing import Any, Dict, List

from pydantic import BaseModel

from config import FEEDBACK_TEMPERATURE
from curriculum import curriculum
from interview_planner import build_candidate_brief, summarize_plan
from llm_client import LLMError, generate_json
from models import FeedbackModel


class _FeedbackPayload(BaseModel):
    summary: str
    strengths: List[str]
    gaps: List[str]
    next: List[str]


EVALUATOR_SYSTEM_PROMPT = """You are an interview evaluator. You are given the complete transcript of a technical interview between an interviewer and a candidate who just finished a 31-day AI Engineering cohort, plus context on what the interviewer was probing for.

Produce a structured assessment of the CANDIDATE only.

HARD REQUIREMENTS:
- Every point must reference an actual moment from the transcript: something the candidate said, a specific example they gave, a question they could not answer, or a term they used incorrectly.
- Quote or paraphrase their own words where it helps ("described chunking as 'just splitting by paragraph'").
- Be honest. If an answer was thin, say so plainly and specifically. Do not inflate.
- Judge only what is in the transcript. Never mention attempt counts, skipped missions, scores, or any profile data as if it were evidence — the candidate never saw that data.
- Write to the candidate in second person where natural, in a professional and constructive tone.

BANNED — these are automatic failures:
- Vague praise: "good understanding of AI concepts", "solid grasp of fundamentals".
- Vague criticism: "needs to study more", "could go deeper".
- Useless advice: "keep practicing", "read more documentation".

GOOD EXAMPLES:
- strength: "Explained the difference between cosine similarity and dot product using a concrete healthcare-document example, and correctly noted normalization makes them equivalent."
- gap: "Could not articulate when to use fine-tuning versus RAG, defaulting to 'it depends' without naming a single criterion even after a direct follow-up."
- next: "Build a decision matrix for fine-tuning vs prompting vs RAG with concrete thresholds — dataset size, how often the knowledge changes, latency budget, and cost per 1k requests."

OUTPUT FORMAT — JSON only:
{
  "summary": "2-3 sentences: overall assessment of the candidate's technical depth and readiness, grounded in the interview.",
  "strengths": ["2-4 specific strengths, each tied to a moment in the interview"],
  "gaps": ["2-4 specific gaps, each tied to a moment in the interview"],
  "next": ["2-4 actionable, concrete recommendations"]
}"""


def _render_transcript(history: List[Dict[str, str]]) -> str:
    lines = []
    for message in history:
        speaker = "INTERVIEWER" if message["role"] in ("assistant", "model") else "CANDIDATE"
        lines.append(f"{speaker}: {message['content']}")
    return "\n\n".join(lines)


def _coverage_note(session: Dict[str, Any]) -> str:
    days = sorted(session.get("topics_covered", set()))
    covered = ", ".join(f"Day {d} ({curriculum.get_title(d)})" for d in days) or "none"
    return (
        f"Questions asked: {session.get('question_count', 0)}\n"
        f"Curriculum days covered in this interview: {covered}"
    )


def generate(session: Dict[str, Any]) -> FeedbackModel:
    """Generate the closing assessment for a finished interview."""
    candidate = session.get("candidate", {}) or {}
    history = session.get("conversation_history", []) or []

    user_content = "\n\n".join(
        [
            f"CANDIDATE CONTEXT (background only — never cite this as evidence)\n"
            f"{build_candidate_brief(candidate)}",
            f"WHAT THE INTERVIEWER WAS PROBING FOR\n{summarize_plan(session.get('interview_plan', []))}",
            f"INTERVIEW COVERAGE\n{_coverage_note(session)}",
            f"FULL TRANSCRIPT\n{_render_transcript(history)}",
            "Now produce the assessment JSON.",
        ]
    )

    try:
        raw = generate_json(
            EVALUATOR_SYSTEM_PROMPT,
            [{"role": "user", "content": user_content}],
            FEEDBACK_TEMPERATURE,
            response_schema=_FeedbackPayload,
        )
        return _to_model(raw)
    except LLMError:
        # The interview itself already succeeded — degrade gracefully rather
        # than losing the whole session to a failed evaluator call.
        return _fallback_feedback(session)


def _to_model(raw: Dict[str, Any]) -> FeedbackModel:
    def as_list(value: Any) -> List[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
        return []

    return FeedbackModel(
        summary=str(raw.get("summary") or "").strip() or "Assessment unavailable.",
        strengths=as_list(raw.get("strengths")),
        gaps=as_list(raw.get("gaps")),
        next=as_list(raw.get("next")),
    )


def _fallback_feedback(session: Dict[str, Any]) -> FeedbackModel:
    """Deterministic, honest feedback used only if the evaluator call fails."""
    evaluations = session.get("answer_evaluations", []) or []
    member = (session.get("candidate", {}) or {}).get("member", {}) or {}
    name = member.get("name", "The candidate")

    strong_days = [e["day"] for e in evaluations if e.get("quality") == "strong"]
    weak_days = [e["day"] for e in evaluations if e.get("quality") in ("vague", "dont_know")]

    def label(days: List[int]) -> List[str]:
        seen, out = set(), []
        for day in days:
            if day in seen:
                continue
            seen.add(day)
            out.append(f"Day {day} — {curriculum.get_title(day)}")
        return out

    return FeedbackModel(
        summary=(
            f"{name} completed {session.get('question_count', 0)} questions across "
            f"{len(session.get('topics_covered', set()))} curriculum areas. "
            "The automated evaluator was unavailable, so this summary reflects only "
            "per-answer signals captured during the interview, not a full review."
        ),
        strengths=[f"Answered in depth on {item}" for item in label(strong_days)] or
                  ["No answer was scored as strong during this interview."],
        gaps=[f"Answers stayed surface-level on {item}" for item in label(weak_days)] or
             ["No clear gaps were flagged during the interview."],
        next=[
            f"Revisit {item} and rebuild that piece end to end, writing down the "
            f"decisions you made and why."
            for item in label(weak_days)[:3]
        ] or ["Re-run this interview to get a full assessment."],
    )
