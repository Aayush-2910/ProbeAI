"""THE BRAIN.

Runs once per session. Reads the candidate profile against the 31-day
curriculum and produces an ordered, personalized interview plan: which
curriculum days to probe, how hard to push, and what to ask first.

This is deliberately deterministic Python rather than an LLM call — the plan
must be stable, instant, and auditable. The LLM does the talking; this decides
what the talking is about.
"""

from typing import Any, Dict, List, Optional

from config import (
    DIFFICULTY_ARCHITECTURE,
    DIFFICULTY_FOUNDATIONAL,
    DIFFICULTY_IMPLEMENTATION,
    NON_TECHNICAL_ROLE_KEYWORDS,
    PLAN_MAX_TARGETS,
    PLAN_MIN_DISTINCT_DAYS,
    PLAN_MIN_TARGETS,
    WEAK_AREA_RATIO,
)
from curriculum import Curriculum, curriculum as default_curriculum

# Priority buckets, ordered most urgent first.
PRIORITY_CRITICAL = "CRITICAL"        # skipped entirely
PRIORITY_HIGH = "HIGH"                # attempted and failed
PRIORITY_MEDIUM_HIGH = "MEDIUM-HIGH"  # passed but 4+ attempts
PRIORITY_MEDIUM = "MEDIUM"            # passed but 2-3 attempts
PRIORITY_BLIND_SPOT = "BLIND-SPOT"    # never appears in missions at all
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

# A candidate who never opened a day is only worth 2 questions at most —
# the interview should be about what they did, not an inventory of gaps.
MAX_BLIND_SPOT_TARGETS = 2

# Core days get preference when several candidates for a slot tie.
CORE_DAYS = {7, 9, 11, 12, 13, 15, 16, 21, 23, 25, 27, 28, 29}


# --- Step 1: profile the candidate's mission signals ------------------------


def _classify_mission(mission: Dict[str, Any]) -> Dict[str, str]:
    """Map one mission record to a priority bucket + a human-readable signal."""
    if mission.get("skipped"):
        return {
            "priority": PRIORITY_CRITICAL,
            "signal": "skipped this day entirely",
        }

    attempts = mission.get("attempts") or 1
    passed = mission.get("passed")

    if passed is False:
        return {
            "priority": PRIORITY_HIGH,
            "signal": f"attempted {attempts}x and did not pass",
        }

    if attempts >= 4:
        return {
            "priority": PRIORITY_MEDIUM_HIGH,
            "signal": f"passed but needed {attempts} attempts",
        }

    if attempts >= 2:
        return {
            "priority": PRIORITY_MEDIUM,
            "signal": f"passed on attempt {attempts}",
        }

    return {
        "priority": PRIORITY_LOW,
        "signal": "passed on the first attempt",
    }


def profile_missions(
    candidate: Dict[str, Any],
    curric: Curriculum,
) -> List[Dict[str, Any]]:
    """Step 1 — enrich each mission with curriculum context and a priority."""
    profiled: List[Dict[str, Any]] = []

    for mission in candidate.get("missions", []) or []:
        day = mission.get("day")
        if day is None:
            continue
        day = int(day)
        classification = _classify_mission(mission)
        profiled.append(
            {
                "curriculum_day": day,
                "module": curric.get_module(day),
                "module_id": (curric.get_day(day) or {}).get("module_id"),
                "topic_title": mission.get("title") or curric.get_title(day),
                "objectives": curric.get_objectives(day),
                "tools": curric.get_tools(day),
                "priority": classification["priority"],
                "candidate_signal": classification["signal"],
                "attempted": True,
            }
        )

    return profiled


# --- Step 2: find days that never appear in the missions list ---------------


def find_blind_spots(
    profiled: List[Dict[str, Any]],
    curric: Curriculum,
) -> List[Dict[str, Any]]:
    attempted_days = {p["curriculum_day"] for p in profiled}
    blind: List[Dict[str, Any]] = []

    for day in curric.all_days():
        if day in attempted_days:
            continue
        blind.append(
            {
                "curriculum_day": day,
                "module": curric.get_module(day),
                "module_id": (curric.get_day(day) or {}).get("module_id"),
                "topic_title": curric.get_title(day),
                "objectives": curric.get_objectives(day),
                "tools": curric.get_tools(day),
                "priority": PRIORITY_BLIND_SPOT,
                "candidate_signal": "never attempted this day",
                "attempted": False,
            }
        )
    return blind


# --- Step 3: difficulty calibration -----------------------------------------


def _is_non_technical(job_role: str) -> bool:
    role = f" {job_role.lower()} "
    return any(keyword in role for keyword in NON_TECHNICAL_ROLE_KEYWORDS)


_STEP_DOWN = {
    DIFFICULTY_ARCHITECTURE: DIFFICULTY_IMPLEMENTATION,
    DIFFICULTY_IMPLEMENTATION: DIFFICULTY_FOUNDATIONAL,
    DIFFICULTY_FOUNDATIONAL: DIFFICULTY_FOUNDATIONAL,
}

_STEP_UP = {
    DIFFICULTY_FOUNDATIONAL: DIFFICULTY_IMPLEMENTATION,
    DIFFICULTY_IMPLEMENTATION: DIFFICULTY_ARCHITECTURE,
    DIFFICULTY_ARCHITECTURE: DIFFICULTY_ARCHITECTURE,
}


def calibrate_difficulty(candidate: Dict[str, Any]) -> str:
    """Difficulty comes from role and seniority, then gets a reality check.

    Role and years set the baseline. Cohort performance then adjusts it by at
    most one level: a candidate who failed several days and passed almost
    nothing first try won't have a useful conversation about scale trade-offs
    whatever their title says, while a technical candidate who aced all 31 days
    can take architecture questions a year or two early.
    """
    member = candidate.get("member", candidate) or {}
    years = int(member.get("yearsExperience") or 0)
    role = str(member.get("jobRole") or "")

    if years <= 2 or _is_non_technical(role):
        difficulty = DIFFICULTY_FOUNDATIONAL
    elif years <= 7:
        difficulty = DIFFICULTY_IMPLEMENTATION
    else:
        difficulty = DIFFICULTY_ARCHITECTURE

    missions = candidate.get("missions") or []
    if missions:
        signals = candidate.get("signals", {}) or {}
        attempted = [m for m in missions if not m.get("skipped")]
        failures = sum(1 for m in attempted if m.get("passed") is False)
        first_try = signals.get("missionsFirstTry")
        if first_try is None:
            first_try = sum(
                1 for m in attempted
                if m.get("passed") and (m.get("attempts") or 1) == 1
            )
        first_try_ratio = first_try / len(missions)

        skips = sum(1 for m in missions if m.get("skipped"))
        mastered = (
            failures == 0
            and skips == 0
            and first_try_ratio >= 0.9
            and years >= 3
            and not _is_non_technical(role)
        )

        if failures >= 3 or first_try_ratio < 0.35:
            difficulty = _STEP_DOWN[difficulty]
        elif mastered:
            difficulty = _STEP_UP[difficulty]

    return difficulty


# --- Step 4: question templates ---------------------------------------------

QUESTION_TEMPLATES: Dict[str, Dict[str, str]] = {
    DIFFICULTY_FOUNDATIONAL: {
        PRIORITY_LOW: "You cleared {title} on the first try — in your own words, what is the core idea there and why does it matter?",
        PRIORITY_MEDIUM: "{title} took you a couple of passes. What part of it was hardest to get your head around?",
        PRIORITY_MEDIUM_HIGH: "{title} took a few attempts. Can you talk me through what you eventually understood about it?",
        PRIORITY_HIGH: "{title} didn't go through in the end. What do you remember about where it stopped making sense?",
        PRIORITY_CRITICAL: "You skipped {title} — no judgment at all. What do you know about it from anywhere else?",
        PRIORITY_BLIND_SPOT: "We haven't talked about {title} yet. Have you come across {tool} before, and what's your understanding of it?",
    },
    DIFFICULTY_IMPLEMENTATION: {
        PRIORITY_LOW: "You got through {title} cleanly. Walk me through how you actually implemented it — what did your code do, step by step?",
        PRIORITY_MEDIUM: "{title} took a couple of attempts. When you were working with {tool}, what broke first and how did you get past it?",
        PRIORITY_MEDIUM_HIGH: "You iterated a fair bit on {title}. What was the specific thing that kept failing, and what finally fixed it?",
        PRIORITY_HIGH: "{title} didn't pass. Walk me through your approach and where it fell apart.",
        PRIORITY_CRITICAL: "You skipped {title}. If you had to add it to your project tomorrow, how would you start?",
        PRIORITY_BLIND_SPOT: "How would you implement {title} in the project you built — what would you reach for first?",
    },
    DIFFICULTY_ARCHITECTURE: {
        PRIORITY_LOW: "You handled {title} without much trouble. What trade-offs did you weigh, and what would change if this had to serve ten times the traffic?",
        PRIORITY_MEDIUM: "On {title}, what was the design decision you went back and forth on, and how did you settle it?",
        PRIORITY_MEDIUM_HIGH: "You iterated on {title} quite a bit. Looking back, what would you architect differently now, and why?",
        PRIORITY_HIGH: "{title} didn't land. If you owned that decision today, how would you approach it differently?",
        PRIORITY_CRITICAL: "You skipped {title}. As the senior engineer shipping this to production, how would you decide the approach there?",
        PRIORITY_BLIND_SPOT: "If you were designing {title} for a production system, what would drive your decisions?",
    },
}

SYNTHESIS_QUESTIONS = {
    DIFFICULTY_FOUNDATIONAL: "Looking back across the whole cohort, which piece finally clicked for you — and what would you want to build with it first?",
    DIFFICULTY_IMPLEMENTATION: "If you rebuilt your capstone from scratch with everything you know now, what would you do differently and why?",
    DIFFICULTY_ARCHITECTURE: "Take the full pipeline you built — ingestion, retrieval, generation, agents, deployment. Under real production load, what breaks first, and how would you harden it?",
}


def _suggest_question(target: Dict[str, Any], difficulty: str) -> str:
    template = QUESTION_TEMPLATES[difficulty].get(
        target["priority"],
        QUESTION_TEMPLATES[difficulty][PRIORITY_MEDIUM],
    )
    tools = target.get("tools") or []
    return template.format(
        title=target.get("topic_title") or f"Day {target['curriculum_day']}",
        tool=tools[0] if tools else "the tooling for that day",
        module=target.get("module") or "",
    )


# --- Step 4: assemble the plan ----------------------------------------------


def _sort_key(target: Dict[str, Any]):
    """Priority first, then core-curriculum days, then chronological order."""
    return (
        PRIORITY_RANK[target["priority"]],
        0 if target["curriculum_day"] in CORE_DAYS else 1,
        target["curriculum_day"],
    )


def _pick_with_module_spread(
    pool: List[Dict[str, Any]],
    count: int,
    seen_modules: Optional[set] = None,
) -> List[Dict[str, Any]]:
    """Take `count` targets, preferring one per module before repeating a module."""
    seen_modules = set() if seen_modules is None else set(seen_modules)
    chosen: List[Dict[str, Any]] = []
    remaining = list(pool)

    # First pass: at most one per module, in priority order.
    for target in list(remaining):
        if len(chosen) >= count:
            break
        module = target.get("module")
        if module in seen_modules:
            continue
        chosen.append(target)
        seen_modules.add(module)
        remaining.remove(target)

    # Second pass: fill any remaining slots by priority.
    for target in remaining:
        if len(chosen) >= count:
            break
        chosen.append(target)

    return chosen


def create_plan(
    candidate: Dict[str, Any],
    curric: Curriculum = default_curriculum,
) -> List[Dict[str, Any]]:
    """Produce the ordered interview plan for one candidate."""
    difficulty = calibrate_difficulty(candidate)

    profiled = profile_missions(candidate, curric)
    blind_spots = find_blind_spots(profiled, curric)

    weak_pool = sorted(
        [t for t in profiled if t["priority"] in WEAK_PRIORITIES],
        key=_sort_key,
    )
    blind_pool = sorted(blind_spots, key=_sort_key)[:MAX_BLIND_SPOT_TARGETS]
    strong_pool = sorted(
        [t for t in profiled if t["priority"] == PRIORITY_LOW],
        key=_sort_key,
    )

    # Blind spots are weak areas too, but capped so they can't dominate.
    weak_pool = sorted(weak_pool + blind_pool, key=_sort_key)

    target_count = PLAN_MAX_TARGETS
    available = len(weak_pool) + len(strong_pool)
    if available < target_count:
        target_count = max(min(available, PLAN_MIN_TARGETS), min(available, 1))

    n_weak = min(len(weak_pool), round(target_count * WEAK_AREA_RATIO))
    n_strong = min(len(strong_pool), target_count - n_weak)
    # If one pool is thin, let the other absorb the slack.
    n_weak = min(len(weak_pool), target_count - n_strong)

    chosen_strong = _pick_with_module_spread(strong_pool, n_strong)
    chosen_weak = _pick_with_module_spread(
        weak_pool, n_weak, seen_modules={t["module"] for t in chosen_strong}
    )

    ordered = _order_targets(chosen_strong, chosen_weak)
    ordered = _ensure_day_spread(ordered, weak_pool + strong_pool)

    plan: List[Dict[str, Any]] = []
    for index, target in enumerate(ordered):
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
                "suggested_question": _suggest_question(target, difficulty),
                "role": target.get("role", "probe"),
            }
        )

    plan.append(_synthesis_target(len(plan) + 1, difficulty, curric))
    return plan


def _order_targets(
    strong: List[Dict[str, Any]],
    weak: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Open on a win, spend the middle on weak areas, sprinkle strengths in."""
    ordered: List[Dict[str, Any]] = []
    strong = list(strong)
    # Module spread decided *which* weak areas make the cut; priority decides
    # the order we hit them in, so the biggest gaps get time while it lasts.
    weak = sorted(weak, key=_sort_key)

    if strong:
        opener = strong.pop(0)
        opener["role"] = "opening"
        ordered.append(opener)
    elif weak:
        # No first-try passes at all — open on the gentlest weak area instead.
        opener = weak.pop(-1)
        opener["role"] = "opening"
        ordered.append(opener)

    # Interleave: roughly two weak areas for every strong-area verification.
    while weak or strong:
        for _ in range(2):
            if weak:
                ordered.append(weak.pop(0))
        if strong:
            ordered.append(strong.pop(0))

    return ordered


def _ensure_day_spread(
    ordered: List[Dict[str, Any]],
    all_targets: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Guarantee the plan spans at least PLAN_MIN_DISTINCT_DAYS curriculum days."""
    days = {t["curriculum_day"] for t in ordered}
    if len(days) >= PLAN_MIN_DISTINCT_DAYS:
        return ordered

    for target in sorted(all_targets, key=_sort_key):
        if len(days) >= PLAN_MIN_DISTINCT_DAYS:
            break
        if target["curriculum_day"] in days:
            continue
        ordered.append(target)
        days.add(target["curriculum_day"])

    return ordered


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
        "role": "synthesis",
    }


# --- Candidate brief (shared by the engine and the evaluator) ---------------


def build_candidate_brief(candidate: Dict[str, Any], curric: Curriculum = default_curriculum) -> str:
    """Compact prose summary of the candidate, embedded in LLM prompts."""
    member = candidate.get("member", {}) or {}
    signals = candidate.get("signals", {}) or {}
    profiled = profile_missions(candidate, curric)

    def days_with(priority: str) -> List[str]:
        return [
            f"Day {t['curriculum_day']} ({t['topic_title']})"
            for t in profiled
            if t["priority"] == priority
        ]

    skipped = days_with(PRIORITY_CRITICAL)
    failed = days_with(PRIORITY_HIGH)
    struggled = days_with(PRIORITY_MEDIUM_HIGH) + days_with(PRIORITY_MEDIUM)
    strong = days_with(PRIORITY_LOW)

    lines = [
        f"Name: {member.get('name', 'the candidate')}",
        f"Role: {member.get('jobRole', 'unknown')} | Experience: {member.get('yearsExperience', '?')} years"
        f" | Education: {member.get('education', 'not provided')}",
        f"Engagement: {signals.get('commitDays', '?')}/31 active days, "
        f"{signals.get('missionsCompleted', '?')} missions completed, "
        f"{signals.get('missionsFirstTry', '?')} passed first try",
    ]

    if strong:
        lines.append(f"Strong (first-try passes): {', '.join(strong[:8])}")
    if struggled:
        lines.append(f"Needed rework: {', '.join(struggled[:8])}")
    if failed:
        lines.append(f"Failed: {', '.join(failed)}")
    if skipped:
        lines.append(f"Skipped entirely: {', '.join(skipped)}")

    return "\n".join(lines)


def summarize_plan(plan: List[Dict[str, Any]]) -> str:
    """Render the plan as compact text for the interviewer's system prompt."""
    rows = []
    for item in plan:
        objectives = "; ".join(item.get("objectives_to_probe", []))
        rows.append(
            f"{item['order']}. Day {item['curriculum_day']} — {item['topic_title']} "
            f"[{item['priority']}] ({item['module']})\n"
            f"   signal: {item['candidate_signal']}\n"
            f"   probe: {objectives}\n"
            f"   suggested: {item['suggested_question']}"
        )
    return "\n".join(rows)
