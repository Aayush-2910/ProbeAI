"""AGENT 1 — THE PLANNER. Runs once, when a session is created.

Decides *what* the interview is about: which curriculum days to probe, in what
order, at what difficulty, and which authored question to open each topic with.
It never talks to the candidate.

Deliberately deterministic Python rather than an LLM call. The plan must be
stable, instant and auditable — the same candidate should always produce the
same plan, and when a question looks wrong you want to read the rule that chose
it, not re-roll a generation. The LLM does the talking; this decides what the
talking is about.

RAG is used here for retrieval, not generation: the vector store supplies the
curriculum context and the best-matching bank question for each target.
"""

from typing import Any, Dict, List, Optional, Tuple

from config import (
    MAX_BLIND_SPOT_TARGETS,
    PLAN_MAX_TARGETS,
    PLAN_MIN_DISTINCT_DAYS,
    PLAN_MIN_TARGETS,
    WEAK_AREA_RATIO,
)
from core.candidate_profile import build_profile
from core.curriculum import Curriculum, curriculum as default_curriculum
from logging_config import get_logger
from rag.vector_store import vector_store

logger = get_logger("agent.planner")

PRIORITY_CRITICAL = "CRITICAL"        # skipped the day entirely
PRIORITY_HIGH = "HIGH"                # attempted and failed
PRIORITY_MEDIUM_HIGH = "MEDIUM-HIGH"  # passed, but needed 4+ attempts
PRIORITY_MEDIUM = "MEDIUM"            # passed on attempt 2-3
PRIORITY_BLIND_SPOT = "BLIND-SPOT"    # never appears in the missions list
PRIORITY_LOW = "LOW"                  # passed first try

PRIORITY_RANK = {
    PRIORITY_CRITICAL: 0,
    PRIORITY_HIGH: 1,
    PRIORITY_MEDIUM_HIGH: 2,
    PRIORITY_BLIND_SPOT: 3,
    PRIORITY_MEDIUM: 4,
    PRIORITY_LOW: 5,
}

WEAK_PRIORITIES = {
    PRIORITY_CRITICAL,
    PRIORITY_HIGH,
    PRIORITY_MEDIUM_HIGH,
    PRIORITY_BLIND_SPOT,
    PRIORITY_MEDIUM,
}

# The link between what a candidate did and what we may safely ask. A question
# tagged `built` says "walk me through how you implemented it" — asking that
# about a day they skipped is the single most obvious way to sound like a bot
# that never read their profile.
ASSUMES_FOR_PRIORITY = {
    PRIORITY_CRITICAL: "none",
    PRIORITY_BLIND_SPOT: "none",
    PRIORITY_HIGH: "studied",
    PRIORITY_MEDIUM_HIGH: "built",
    PRIORITY_MEDIUM: "built",
    PRIORITY_LOW: "built",
}

# Days that carry the most signal about AI engineering ability; used only to
# break ties between otherwise equal candidates for a slot.
CORE_DAYS = {7, 9, 10, 11, 12, 13, 16, 21, 22, 23, 25, 27, 28, 29}


# --- Step 1: classify what happened on each day -----------------------------


def classify_mission(mission: Dict[str, Any]) -> Tuple[str, str]:
    """Map one mission record to (priority, human-readable signal)."""
    if mission.get("skipped"):
        return PRIORITY_CRITICAL, "skipped this day entirely"

    attempts = mission.get("attempts") or 1
    if mission.get("passed") is False:
        return PRIORITY_HIGH, f"attempted {attempts}x and did not pass"
    if attempts >= 4:
        return PRIORITY_MEDIUM_HIGH, f"passed but needed {attempts} attempts"
    if attempts >= 2:
        return PRIORITY_MEDIUM, f"passed on attempt {attempts}"
    return PRIORITY_LOW, "passed on the first attempt"


def _target(day: int, priority: str, signal: str, curric: Curriculum) -> Dict[str, Any]:
    return {
        "curriculum_day": day,
        "module": curric.get_module(day),
        "topic_title": curric.get_title(day),
        "objectives": curric.get_objectives(day),
        "tools": curric.get_tools(day),
        "priority": priority,
        "candidate_signal": signal,
        "assumes": ASSUMES_FOR_PRIORITY[priority],
    }


def profile_missions(candidate: Dict[str, Any], curric: Curriculum) -> List[Dict[str, Any]]:
    targets: List[Dict[str, Any]] = []
    for mission in candidate.get("missions") or []:
        day = mission.get("day")
        if day is None or not curric.has_day(int(day)):
            continue
        priority, signal = classify_mission(mission)
        targets.append(_target(int(day), priority, signal, curric))
    return targets


def find_blind_spots(
    attempted: List[Dict[str, Any]], curric: Curriculum
) -> List[Dict[str, Any]]:
    """Days that never appear in the missions list at all.

    Candidates attempted only 9-11 of 31 days, so this pool is large — hence
    the hard cap in `create_plan`. The interview should be about what they did.
    """
    seen = {t["curriculum_day"] for t in attempted}
    return [
        _target(day, PRIORITY_BLIND_SPOT, "never attempted this day", curric)
        for day in curric.all_days()
        if day not in seen
    ]


# --- Step 2: attach retrieved context and a bank question -------------------


def _retrieval_query(target: Dict[str, Any]) -> str:
    """Topic text used as the vector-store query for this target."""
    parts = [target["topic_title"], target.get("module", "")]
    parts.extend(target.get("objectives", [])[:3])
    parts.extend(target.get("tools", [])[:3])
    return " ".join(p for p in parts if p)


def attach_context(
    target: Dict[str, Any],
    difficulty: str,
    used_question_ids: List[str],
    top_k: int = 4,
) -> Dict[str, Any]:
    """Fill in curriculum context and the best available question.

    Question selection relaxes in three stages rather than giving up: the exact
    (day, difficulty, assumes) match first, then any difficulty on that day,
    then anywhere in the module. `assumes` is never relaxed — it is the
    constraint that keeps the question truthful about what the candidate did.
    """
    query = _retrieval_query(target)
    day = target["curriculum_day"]
    assumes = target["assumes"]

    context = vector_store.query_curriculum(query, top_k=top_k, days=[day])
    target["retrieved_context"] = [row["text"] for row in context]

    # Relaxation ladder. Difficulty is negotiable, the day is negotiable, but
    # `assumes` never is — asking implementation detail about a day they
    # skipped is the one failure that makes the whole thing look automated.
    #
    # Dropping difficulty before day is also the semantically right order: you
    # genuinely cannot ask an implementation-level question about work that was
    # never done, so a skipped day *should* fall back to a conceptual question.
    attempts = (
        {"days": [day], "difficulty": difficulty, "assumes": assumes},
        {"days": [day], "assumes": assumes},
        {"modules": [_module_number(day)], "difficulty": difficulty, "assumes": assumes},
        {"modules": [_module_number(day)], "assumes": assumes},
    )

    for filters in attempts:
        rows = vector_store.query_questions(
            query, top_k=5, exclude_qids=used_question_ids, **filters
        )
        if rows:
            metadata = rows[0]["metadata"]
            target["question_id"] = metadata.get("qid")
            target["suggested_question"] = metadata.get("question", "")
            target["followup"] = metadata.get("followup", "")
            target["looks_for"] = metadata.get("looks_for", "")
            return target

    # Nothing in the bank fits. Build a question from the curriculum instead of
    # leaving the field empty: the bank cannot cover every (day, difficulty,
    # assumes) combination, and an empty suggestion silently hands the whole
    # decision to the LLM with no topic anchor.
    target.update(_templated_question(target, difficulty))
    logger.warning(
        "no bank question matched; using curriculum template",
        extra={"event": "planner.templated_question", "day": day,
               "difficulty": difficulty, "assumes": assumes},
    )
    return target


# Fallback phrasing, keyed by what the candidate actually did. Kept truthful to
# `assumes` for the same reason the bank filter is.
_TEMPLATES = {
    ("none", "foundational"): "We haven't touched on {title} yet. What's your understanding of it?",
    ("none", "implementation"): "If you had to add {title} to your project tomorrow, how would you start?",
    ("none", "architecture"): "If you were designing {title} for a production system, what would drive your decisions?",
    ("studied", "foundational"): "{title} didn't quite come together. What do you remember about where it stopped making sense?",
    ("studied", "implementation"): "{title} didn't pass in the end. Walk me through your approach and where it fell apart.",
    ("studied", "architecture"): "{title} didn't land. If you owned that decision today, how would you approach it differently?",
    ("built", "foundational"): "You worked through {title}. In your own words, what is the core idea there?",
    ("built", "implementation"): "Walk me through how you actually implemented {title} — what did your code do?",
    ("built", "architecture"): "On {title}, what trade-offs did you weigh, and what would you change at ten times the scale?",
}

_FOLLOWUPS = {
    "none": "What would worry you most about getting that wrong?",
    "studied": "What would you try differently if you picked it up again this week?",
    "built": "Can you give me a specific example from what you built?",
}


def _templated_question(target: Dict[str, Any], difficulty: str) -> Dict[str, Any]:
    assumes = target["assumes"]
    template = _TEMPLATES.get(
        (assumes, difficulty), _TEMPLATES[(assumes, "implementation")]
    )
    objectives = target.get("objectives", [])
    return {
        "question_id": None,
        "suggested_question": template.format(title=target["topic_title"]),
        "followup": _FOLLOWUPS[assumes],
        "looks_for": "; ".join(objectives[:2]) or target["topic_title"],
    }


def _module_number(day: int, curric: Curriculum = default_curriculum) -> int:
    return curric.get_module_id(day) or 0


# --- Step 3: choose and order the targets -----------------------------------


def _sort_key(target: Dict[str, Any]):
    """Priority first, then core days, then chronological."""
    return (
        PRIORITY_RANK[target["priority"]],
        0 if target["curriculum_day"] in CORE_DAYS else 1,
        target["curriculum_day"],
    )


def _pick_spread(
    pool: List[Dict[str, Any]], count: int, seen_modules: Optional[set] = None
) -> List[Dict[str, Any]]:
    """Take `count` targets, preferring one per module before repeating one."""
    seen = set(seen_modules or ())
    chosen: List[Dict[str, Any]] = []
    remaining = list(pool)

    for target in list(remaining):
        if len(chosen) >= count:
            break
        module = target.get("module")
        if module and module in seen:
            continue
        chosen.append(target)
        seen.add(module)
        remaining.remove(target)

    for target in remaining:
        if len(chosen) >= count:
            break
        chosen.append(target)

    return chosen


def _order(strong: List[Dict[str, Any]], weak: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Open on a win, spend the middle on gaps, keep a strength in reserve.

    Opening on something they passed first try is not politeness — a candidate
    who fails the first question tightens up, and everything after it reads as
    worse than it is.
    """
    ordered: List[Dict[str, Any]] = []
    strong, weak = list(strong), sorted(weak, key=_sort_key)

    if strong:
        opener = strong.pop(0)
    elif weak:
        opener = weak.pop(-1)  # no first-try passes: open on the gentlest gap
    else:
        return ordered
    opener["role"] = "opening"
    ordered.append(opener)

    # Roughly two gaps for every strength, so the interview probes without
    # feeling like an interrogation.
    while weak or strong:
        for _ in range(2):
            if weak:
                ordered.append(weak.pop(0))
        if strong:
            ordered.append(strong.pop(0))

    return ordered


def _ensure_day_spread(
    ordered: List[Dict[str, Any]], pool: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    days = {t["curriculum_day"] for t in ordered}
    for target in sorted(pool, key=_sort_key):
        if len(days) >= PLAN_MIN_DISTINCT_DAYS:
            break
        if target["curriculum_day"] not in days:
            ordered.append(target)
            days.add(target["curriculum_day"])
    return ordered


SYNTHESIS_QUESTIONS = {
    "foundational": "Looking back across the whole cohort, which piece finally clicked for you — and what would you want to build with it first?",
    "implementation": "If you rebuilt your capstone from scratch with everything you know now, what would you do differently and why?",
    "architecture": "Take the full pipeline you built — ingestion, retrieval, generation, agents, deployment. Under real production load, what breaks first, and how would you harden it?",
}


def _synthesis_target(order: int, difficulty: str, curric: Curriculum) -> Dict[str, Any]:
    return {
        "order": order,
        "curriculum_day": 31,
        "module": curric.get_module(31) or "Production & Capstone",
        "topic_title": "Synthesis / big picture",
        "priority": "SYNTHESIS",
        "difficulty_level": difficulty,
        "objectives_to_probe": [
            "Connect the pieces of the cohort into one working system",
            "Reflect on trade-offs and what they would change",
        ],
        "tools": [],
        "candidate_signal": "closing question — tests whether the parts add up to a whole",
        "suggested_question": SYNTHESIS_QUESTIONS[difficulty],
        "question_id": None,
        "assumes": "built",
        "followup": "What would you keep exactly as it is?",
        "looks_for": "connects several cohort topics into one coherent system with reasoning about trade-offs",
        "role": "synthesis",
        "retrieved_context": [],
    }


# --- Entry point ------------------------------------------------------------


def create_plan(
    candidate: Dict[str, Any], curric: Curriculum = default_curriculum
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Return (profile, ordered plan) for one candidate."""
    profile = build_profile(candidate)
    difficulty = profile["difficulty"]

    attempted = profile_missions(candidate, curric)
    blind = find_blind_spots(attempted, curric)

    weak = [t for t in attempted if t["priority"] in WEAK_PRIORITIES]
    strong = sorted(
        [t for t in attempted if t["priority"] == PRIORITY_LOW], key=_sort_key
    )
    capped_blind = sorted(blind, key=_sort_key)[:MAX_BLIND_SPOT_TARGETS]
    weak = sorted(weak + capped_blind, key=_sort_key)

    available = len(weak) + len(strong)
    target_count = min(PLAN_MAX_TARGETS, available) if available else 0
    if 0 < available < PLAN_MIN_TARGETS:
        target_count = available

    n_weak = min(len(weak), round(target_count * WEAK_AREA_RATIO))
    n_strong = min(len(strong), target_count - n_weak)
    n_weak = min(len(weak), target_count - n_strong)  # let one pool absorb slack

    chosen_strong = _pick_spread(strong, n_strong)
    chosen_weak = _pick_spread(weak, n_weak, {t["module"] for t in chosen_strong})

    ordered = _order(chosen_strong, chosen_weak)
    ordered = _ensure_day_spread(ordered, weak + strong)

    plan: List[Dict[str, Any]] = []
    used_ids: List[str] = []
    for index, target in enumerate(ordered):
        target = attach_context(target, difficulty, used_ids)
        if target.get("question_id"):
            used_ids.append(target["question_id"])
        plan.append(
            {
                "order": index + 1,
                "curriculum_day": target["curriculum_day"],
                "module": target["module"],
                "topic_title": target["topic_title"],
                "priority": target["priority"],
                "difficulty_level": difficulty,
                "objectives_to_probe": target.get("objectives", [])[:3],
                "tools": target.get("tools", [])[:4],
                "candidate_signal": target["candidate_signal"],
                "suggested_question": target["suggested_question"],
                "question_id": target.get("question_id"),
                "assumes": target["assumes"],
                "followup": target.get("followup", ""),
                "looks_for": target.get("looks_for", ""),
                "role": target.get("role", "probe"),
                "retrieved_context": target.get("retrieved_context", []),
            }
        )

    plan.append(_synthesis_target(len(plan) + 1, difficulty, curric))

    logger.info(
        "interview plan built",
        extra={
            "event": "planner.plan_built",
            "candidate": profile["candidate_id"],
            "archetype": profile["archetype"],
            "difficulty": difficulty,
            "targets": len(plan),
            "distinct_days": len({t["curriculum_day"] for t in plan}),
            "bank_questions": sum(1 for t in plan if t.get("question_id")),
        },
    )
    return profile, plan


# --- Prompt rendering (shared by the other agents) --------------------------


def summarize_plan(plan: List[Dict[str, Any]], limit: Optional[int] = None) -> str:
    rows = []
    for item in plan[:limit] if limit else plan:
        objectives = "; ".join(item.get("objectives_to_probe", []))
        rows.append(
            f"{item['order']}. Day {item['curriculum_day']} — {item['topic_title']} "
            f"[{item['priority']}] ({item['module']})\n"
            f"   signal: {item['candidate_signal']}\n"
            f"   probe: {objectives}\n"
            f"   suggested: {item['suggested_question']}"
        )
    return "\n".join(rows)
