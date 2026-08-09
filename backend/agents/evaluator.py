"""AGENT 2 — THE EVALUATOR. Runs on every candidate answer.

Its only job is to judge the answer that just arrived. It does not generate the
next question, it does not talk to the candidate, and its output is never shown
to them. That separation is the point: when one call both scores an answer and
writes the next question, the scoring bends to justify the question it already
wanted to ask.

It runs as its own LLM call with structured output, which costs one extra
round-trip per turn. Worth it — the evaluation is what the interviewer uses to
decide between following up and moving on, and it is the evidence the feedback
agent cites at the end.

If the call fails, `evaluate` degrades to a heuristic rather than raising: a
missing evaluation should cost the interview some nuance, not end it.
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from config import EVALUATOR_TEMPERATURE
from core.llm import LLMError, generate_json
from logging_config import get_logger
from models import Evaluation

logger = get_logger("agent.evaluator")


class _EvaluationPayload(BaseModel):
    """Schema handed to Gemini's JSON mode."""

    quality: str
    key_points_mentioned: List[str]
    missing_concepts: List[str]
    follow_up_needed: bool
    reasoning: str


SYSTEM_PROMPT = """You are the evaluator in a technical interview system. You assess ONE answer at a time.

You do NOT generate questions. You do NOT speak to the candidate. You only judge what was said.

Grade the answer against this scale:
- "strong": specific and concrete. Names real decisions, numbers, failures, or trade-offs from their own work. Demonstrates understanding beyond definitions.
- "adequate": correct but surface-level. Textbook-accurate with no specifics, no example, no evidence they did it themselves.
- "weak": vague, hand-wavy, partially wrong, or dodges the question. Includes confidently stating something incorrect.
- "no_answer": says they do not know, skipped that topic, or gives nothing usable.

RULES:
1. Judge only what is in the answer. Never reward what you assume they meant.
2. Length is not quality. A short precise answer beats a long vague one.
3. "It depends" with no criteria named is weak, not adequate.
4. Confidently wrong is weak, never adequate.
5. If they honestly say they do not know, that is "no_answer" — not "weak". Not knowing is not the same as bluffing.
6. Set follow_up_needed true when a targeted follow-up would genuinely reveal more. Set it false for "strong" (they already showed depth) and for "no_answer" (pressing serves no purpose).

Return JSON only:
{
  "quality": "strong" | "adequate" | "weak" | "no_answer",
  "key_points_mentioned": ["specific things they actually said that were correct and relevant"],
  "missing_concepts": ["things a strong answer would have covered that they did not mention"],
  "follow_up_needed": true | false,
  "reasoning": "one sentence, grounded in their words"
}"""

_VALID_QUALITY = {"strong", "adequate", "weak", "no_answer"}

# Short, low-effort answers that are really admissions of not knowing. Matched
# on the whole normalised answer so a genuine answer containing "not sure" in
# passing is not misread as a non-answer.
_NO_ANSWER_PHRASES = (
    "i don't know", "i dont know", "no idea", "not sure", "i skipped",
    "skipped that", "never did", "never used", "haven't done", "havent done",
    "pass", "no clue", "don't remember", "dont remember",
)


def _heuristic(answer: str) -> Evaluation:
    """Deterministic fallback when the model call fails.

    Deliberately conservative: it can recognise a non-answer and a one-liner,
    and otherwise declines to guess by returning "adequate".
    """
    text = answer.strip().lower()
    words = len(text.split())

    if not text or words <= 2:
        quality, follow_up = "no_answer", False
    elif any(phrase in text for phrase in _NO_ANSWER_PHRASES) and words < 25:
        quality, follow_up = "no_answer", False
    elif words < 20:
        quality, follow_up = "weak", True
    else:
        quality, follow_up = "adequate", True

    return Evaluation(
        quality=quality,
        key_points_mentioned=[],
        missing_concepts=[],
        follow_up_needed=follow_up,
        reasoning="Automated evaluator unavailable; graded on answer length and phrasing only.",
    )


def _coerce(raw: Dict[str, Any]) -> Evaluation:
    quality = str(raw.get("quality") or "").strip().lower()
    if quality not in _VALID_QUALITY:
        quality = "adequate"

    def string_list(value: Any) -> List[str]:
        if isinstance(value, list):
            return [str(v).strip() for v in value if str(v).strip()]
        if isinstance(value, str) and value.strip():
            return [value.strip()]
        return []

    follow_up = bool(raw.get("follow_up_needed", False))
    # Enforce rule 6 in code as well as in the prompt — the model drifts on it,
    # and a follow-up after "I don't know" is the interview's worst moment.
    if quality == "strong":
        follow_up = False
    elif quality == "no_answer":
        follow_up = False

    return Evaluation(
        quality=quality,
        key_points_mentioned=string_list(raw.get("key_points_mentioned")),
        missing_concepts=string_list(raw.get("missing_concepts")),
        follow_up_needed=follow_up,
        reasoning=str(raw.get("reasoning") or "").strip(),
    )


def evaluate(
    question: str,
    answer: str,
    target: Optional[Dict[str, Any]] = None,
    curriculum_day: int = 0,
    question_number: int = 0,
) -> Evaluation:
    """Assess one answer. Never raises — degrades to a heuristic instead."""
    target = target or {}

    context_lines = [f"QUESTION ASKED:\n{question}", f"CANDIDATE'S ANSWER:\n{answer}"]

    if target.get("looks_for"):
        context_lines.append(f"A STRONG ANSWER COVERS:\n{target['looks_for']}")
    if target.get("objectives_to_probe"):
        objectives = "\n".join(f"- {o}" for o in target["objectives_to_probe"])
        context_lines.append(f"CURRICULUM OBJECTIVES FOR THIS TOPIC:\n{objectives}")
    if target.get("retrieved_context"):
        context_lines.append(
            "RETRIEVED CURRICULUM CONTEXT:\n" + "\n".join(target["retrieved_context"][:3])
        )

    context_lines.append("Now return the evaluation JSON.")

    try:
        raw = generate_json(
            SYSTEM_PROMPT,
            [{"role": "user", "content": "\n\n".join(context_lines)}],
            EVALUATOR_TEMPERATURE,
            response_schema=_EvaluationPayload,
            label="evaluator",
        )
        evaluation = _coerce(raw)
    except LLMError as exc:
        logger.warning(
            "evaluator failed; using heuristic",
            extra={"event": "evaluator.fallback", "error": str(exc)},
        )
        evaluation = _heuristic(answer)

    evaluation.curriculum_day = int(curriculum_day or 0)
    evaluation.question_number = int(question_number or 0)

    logger.info(
        "answer evaluated",
        extra={
            "event": "evaluator.done",
            "quality": evaluation.quality,
            "follow_up": evaluation.follow_up_needed,
            "day": evaluation.curriculum_day,
        },
    )
    return evaluation


def render_for_prompt(evaluation: Optional[Evaluation]) -> str:
    """Compact rendering injected into the interviewer's prompt."""
    if evaluation is None:
        return "No previous answer to assess — this is the opening message."

    lines = [f"Quality: {evaluation.quality}", f"Read: {evaluation.reasoning}"]
    if evaluation.key_points_mentioned:
        lines.append("They correctly covered: " + "; ".join(evaluation.key_points_mentioned))
    if evaluation.missing_concepts:
        lines.append("They did not mention: " + "; ".join(evaluation.missing_concepts))
    lines.append(
        "Follow up on this topic." if evaluation.follow_up_needed
        else "Do not follow up — move to the next topic."
    )
    return "\n".join(lines)
