"""Candidate typing.

Turns a raw candidate record into the profile every downstream agent reads:
what kind of engineer this is, how they moved through the cohort, and therefore
how hard the interview should push and which questions fit.

Three independent axes, because collapsing them loses information the
interviewer needs:

  track       technical vs non-technical, from the job role
  seniority   junior / mid / senior / principal, from years of experience
  performance mastery / solid / mixed / struggling, from cohort signals

`difficulty` is derived from track + seniority, then corrected by performance —
a title alone is a poor predictor. A Distinguished Engineer who skipped a third
of the cohort should not be handed architecture questions on the days they
never opened, and an AI Engineer with one year who aced all 31 days can take
harder questions than their tenure suggests.
"""

from typing import Any, Dict, List

from config import (
    DIFFICULTY_ARCHITECTURE,
    DIFFICULTY_FOUNDATIONAL,
    DIFFICULTY_IMPLEMENTATION,
    NON_TECHNICAL_ROLE_KEYWORDS,
)

# --- Bands ------------------------------------------------------------------

TRACK_TECHNICAL = "technical"
TRACK_NON_TECHNICAL = "non_technical"

SENIORITY_JUNIOR = "junior"        # 0-2 years
SENIORITY_MID = "mid"              # 3-7
SENIORITY_SENIOR = "senior"        # 8-15
SENIORITY_PRINCIPAL = "principal"  # 16+

PERF_MASTERY = "mastery"
PERF_SOLID = "solid"
PERF_MIXED = "mixed"
PERF_STRUGGLING = "struggling"

# Archetypes are labels for the combination, used to pick a tone and to explain
# the plan to a human reading the logs. They never reach the candidate.
ARCHETYPE_DESCRIPTIONS = {
    "fast_learner": "Technical and cleared most missions first try — push for depth and trade-offs, they will be bored by definitions.",
    "steady": "Technical and passed consistently without either acing or grinding — probe for the reasoning behind what they built.",
    "grinder": "Technical and got there, but needed repeated attempts — probe whether the understanding stuck or the attempts just converged.",
    "struggling_technical": "Technical background but failed or abandoned several missions — stay concrete, ask about what they built, avoid piling on.",
    "selective_senior": "Senior or principal who engaged deeply in some areas and skipped others outright — go deep where they engaged, treat the gaps as choices rather than failures.",
    "career_switcher": "Non-technical role who worked through a technical cohort and mostly finished — reward conceptual clarity, do not demand implementation detail.",
    "overwhelmed_switcher": "Non-technical role with real failures or heavy skipping — keep it conceptual and encouraging; look for what did land.",
}

# Repeated attempts on a passed mission is the grind signal. Both thresholds
# exist because they catch different shapes: a high average means they ground
# through everything, several 4+ attempt passes means they hit a few walls hard.
GRIND_AVG_ATTEMPTS = 2.2
GRIND_HIGH_EFFORT_COUNT = 3


def _is_non_technical(job_role: str) -> bool:
    """Keyword match with padding so 'hr ' cannot hit 'chr...'."""
    role = f" {job_role.lower().strip()} "
    return any(keyword in role for keyword in NON_TECHNICAL_ROLE_KEYWORDS)


def _seniority(years: int) -> str:
    if years <= 2:
        return SENIORITY_JUNIOR
    if years <= 7:
        return SENIORITY_MID
    if years <= 15:
        return SENIORITY_SENIOR
    return SENIORITY_PRINCIPAL


def _mission_stats(candidate: Dict[str, Any]) -> Dict[str, Any]:
    """Count what actually happened, from the missions list itself.

    `signals` is used only as a fallback: the missions array is the record of
    the days we can ask about, and the two do not always agree.
    """
    missions: List[Dict[str, Any]] = candidate.get("missions") or []
    signals: Dict[str, Any] = candidate.get("signals") or {}

    skipped = [m for m in missions if m.get("skipped")]
    attempted = [m for m in missions if not m.get("skipped")]
    failed = [m for m in attempted if m.get("passed") is False]
    passed = [m for m in attempted if m.get("passed") is True]
    first_try = [m for m in passed if (m.get("attempts") or 1) == 1]
    high_effort = [m for m in passed if (m.get("attempts") or 1) >= 4]

    total = len(missions)
    attempts_values = [m.get("attempts") or 1 for m in attempted]

    return {
        "total_missions": total,
        "skipped": len(skipped),
        "failed": len(failed),
        "passed": len(passed),
        "first_try": len(first_try),
        "high_effort": len(high_effort),
        "first_try_ratio": (len(first_try) / total) if total else 0.0,
        "avg_attempts": (sum(attempts_values) / len(attempts_values)) if attempts_values else 0.0,
        "commit_days": signals.get("commitDays"),
        "missions_completed": signals.get("missionsCompleted"),
    }


def _performance_band(stats: Dict[str, Any]) -> str:
    if not stats["total_missions"]:
        return PERF_MIXED

    if stats["failed"] >= 3 or stats["skipped"] >= 3 or stats["first_try_ratio"] < 0.25:
        return PERF_STRUGGLING
    if stats["failed"] == 0 and stats["skipped"] == 0 and stats["first_try_ratio"] >= 0.8:
        return PERF_MASTERY
    if stats["failed"] == 0 and stats["first_try_ratio"] >= 0.5:
        return PERF_SOLID
    return PERF_MIXED


def _difficulty(track: str, seniority: str, band: str) -> str:
    """Baseline from who they are, then one step of correction from what they did."""
    if track == TRACK_NON_TECHNICAL or seniority == SENIORITY_JUNIOR:
        base = DIFFICULTY_FOUNDATIONAL
    elif seniority == SENIORITY_MID:
        base = DIFFICULTY_IMPLEMENTATION
    else:
        base = DIFFICULTY_ARCHITECTURE

    step_down = {
        DIFFICULTY_ARCHITECTURE: DIFFICULTY_IMPLEMENTATION,
        DIFFICULTY_IMPLEMENTATION: DIFFICULTY_FOUNDATIONAL,
        DIFFICULTY_FOUNDATIONAL: DIFFICULTY_FOUNDATIONAL,
    }
    step_up = {
        DIFFICULTY_FOUNDATIONAL: DIFFICULTY_IMPLEMENTATION,
        DIFFICULTY_IMPLEMENTATION: DIFFICULTY_ARCHITECTURE,
        DIFFICULTY_ARCHITECTURE: DIFFICULTY_ARCHITECTURE,
    }

    if band == PERF_STRUGGLING:
        return step_down[base]
    # Mastery lifts a technical candidate one level; it never promotes a
    # non-technical candidate into architecture questions about code they
    # have not written.
    if band == PERF_MASTERY and track == TRACK_TECHNICAL:
        return step_up[base]
    return base


def _archetype(track: str, seniority: str, band: str, stats: Dict[str, Any]) -> str:
    """Label the *pattern* of how they moved through the cohort.

    Deliberately driven by what they did rather than by the performance band:
    the band measures effort spent, and the two genuinely disagree. Someone who
    passed every mission but needed four attempts each ground it out — they did
    not fail at anything, and calling them "struggling" would be wrong.

    Rules are ordered most-specific first; there is no catch-all bucket.
    """
    failed = stats["failed"]
    skipped = stats["skipped"]
    grinding = (
        stats["avg_attempts"] >= GRIND_AVG_ATTEMPTS
        or stats["high_effort"] >= GRIND_HIGH_EFFORT_COUNT
    )

    if track == TRACK_NON_TECHNICAL:
        # Persisting through a technical cohort from a non-technical role is
        # the story, even when it took many attempts. Only real failures or
        # wholesale skipping change that read.
        return "overwhelmed_switcher" if (failed >= 2 or skipped >= 3) else "career_switcher"

    if band == PERF_MASTERY:
        return "fast_learner"

    # Repeated failures are the strongest signal available; check them first.
    if failed >= 2:
        return "struggling_technical"

    # Skipping is a different act from failing. For a senior it usually means
    # they chose where to spend their time; lower down it means they fell away.
    if skipped >= 2 and seniority in (SENIORITY_SENIOR, SENIORITY_PRINCIPAL):
        return "selective_senior"
    if skipped >= 3:
        return "struggling_technical"

    if grinding:
        return "grinder"
    if stats["first_try_ratio"] >= 0.6:
        return "fast_learner"
    return "steady"


def build_profile(candidate: Dict[str, Any]) -> Dict[str, Any]:
    """The single entry point. Everything downstream reads this dict."""
    member: Dict[str, Any] = candidate.get("member") or {}
    role = str(member.get("jobRole") or "unknown")
    years = int(member.get("yearsExperience") or 0)

    track = TRACK_NON_TECHNICAL if _is_non_technical(role) else TRACK_TECHNICAL
    seniority = _seniority(years)
    stats = _mission_stats(candidate)
    band = _performance_band(stats)
    difficulty = _difficulty(track, seniority, band)
    archetype = _archetype(track, seniority, band, stats)

    return {
        "candidate_id": member.get("id"),
        "name": member.get("name", "the candidate"),
        "role": role,
        "years_experience": years,
        "education": member.get("education"),
        "track": track,
        "seniority": seniority,
        "performance_band": band,
        "difficulty": difficulty,
        "archetype": archetype,
        "archetype_note": ARCHETYPE_DESCRIPTIONS[archetype],
        "stats": stats,
    }


def describe(profile: Dict[str, Any]) -> str:
    """One compact block for LLM prompts and logs."""
    stats = profile["stats"]
    return (
        f"{profile['name']} — {profile['role']}, {profile['years_experience']} years"
        f" ({profile['track']}, {profile['seniority']})\n"
        f"Cohort record: {stats['passed']} passed"
        f" ({stats['first_try']} first try), {stats['failed']} failed,"
        f" {stats['skipped']} skipped, {stats['avg_attempts']:.1f} avg attempts\n"
        f"Read: {profile['archetype']} — {profile['archetype_note']}\n"
        f"Interview at: {profile['difficulty']} level"
    )
