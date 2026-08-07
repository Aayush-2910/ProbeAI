"""Print the interview plan a candidate would get. No API key needed.

    python scripts/preview_plan.py CAND-001
    python scripts/preview_plan.py            # lists every candidate
"""

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from config import CANDIDATES_PATH          # noqa: E402
from curriculum import curriculum           # noqa: E402
from interview_planner import (             # noqa: E402
    build_candidate_brief,
    calibrate_difficulty,
    create_plan,
)

candidates = json.loads(Path(CANDIDATES_PATH).read_text(encoding="utf-8"))
by_id = {c["member"]["id"]: c for c in candidates}

if len(sys.argv) < 2:
    print("Available candidates:\n")
    for candidate in candidates:
        member = candidate["member"]
        print(
            f"  {member['id']}  {member['name']:<16} {member['jobRole']:<28} "
            f"{member['yearsExperience']:>2}y  -> {calibrate_difficulty(candidate)}"
        )
    print("\nUsage: python scripts/preview_plan.py CAND-001")
    raise SystemExit(0)

candidate_id = sys.argv[1].upper()
if candidate_id not in by_id:
    raise SystemExit(f"Unknown candidate '{candidate_id}'. Run without arguments to list them.")

candidate = by_id[candidate_id]
plan = create_plan(candidate, curriculum)

print("=" * 78)
print(build_candidate_brief(candidate))
print("=" * 78)
print(f"Difficulty: {calibrate_difficulty(candidate)}")
print(f"Plan: {len(plan)} targets across {len({p['curriculum_day'] for p in plan})} curriculum days\n")

for item in plan:
    print(f"{item['order']:>2}. Day {item['curriculum_day']:<2} [{item['priority']:^11}] "
          f"{item['topic_title']}  ({item['role']})")
    print(f"    signal:    {item['candidate_signal']}")
    print(f"    probe:     {'; '.join(item['objectives_to_probe'])}")
    print(f"    suggested: {item['suggested_question']}\n")
