"""Indexed, schema-tolerant view over the 31-day cohort curriculum.

The supplied curriculum.json describes modules as inclusive day *ranges*
(`{"n": 3, "days": [7, 10]}` means days 7,8,9,10) and does not stamp a module
onto each day. An earlier variant used explicit day lists plus a `module` field
on every day. Both are accepted here: the module of a day is resolved from the
ranges, and any per-day `module` already present wins.

That resolution matters — the planner spreads questions across modules, and if
`get_module` silently returns "" for every day the spread quietly collapses to
plain priority order.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import CURRICULUM_PATH
from logging_config import get_logger

logger = get_logger("curriculum")


def _expand_days(days: Any) -> List[int]:
    """Turn a module's `days` value into an explicit list of day numbers.

    `[7, 10]` is an inclusive range (7,8,9,10); `[1, 2, 3]` is already a list.
    A two-element pair is only read as a range when its endpoints are more than
    one apart — `[4, 5]` means the same thing either way, so there is no case
    where the two readings disagree.
    """
    if not isinstance(days, (list, tuple)) or not days:
        return []

    try:
        values = [int(d) for d in days]
    except (TypeError, ValueError):
        return []

    if len(values) == 2 and values[1] > values[0] + 1:
        return list(range(values[0], values[1] + 1))
    return values


class Curriculum:
    """Loads curriculum.json once and indexes it for O(1) lookup."""

    def __init__(self, path: Path = CURRICULUM_PATH):
        with open(path, "r", encoding="utf-8") as f:
            raw: Dict[str, Any] = json.load(f)

        self.raw = raw
        self.cohort: str = raw.get("cohort", "AI Cohort")

        self._days: Dict[int, Dict[str, Any]] = {}
        self._day_module: Dict[int, str] = {}
        self._day_module_id: Dict[int, int] = {}
        self.modules: List[Dict[str, Any]] = []

        self._index_modules(raw.get("modules", []) or [])
        self._index_days(raw.get("days", []) or [])

        self.total_days: int = int(raw.get("total_days") or len(self._days))

        orphans = [d for d in self._days if d not in self._day_module]
        if orphans:
            logger.warning(
                "days have no module mapping",
                extra={"event": "curriculum.orphan_days", "days": orphans},
            )

        logger.info(
            "curriculum loaded",
            extra={
                "event": "curriculum.loaded",
                "days": len(self._days),
                "modules": len(self.modules),
                "source": str(path),
            },
        )

    # --- indexing -----------------------------------------------------------

    def _index_modules(self, modules: List[Dict[str, Any]]) -> None:
        for entry in modules:
            module_id = entry.get("n", entry.get("id"))
            title = str(entry.get("title", "")).strip()
            day_numbers = _expand_days(entry.get("days"))

            self.modules.append(
                {"id": module_id, "title": title, "days": day_numbers}
            )

            for day in day_numbers:
                self._day_module[day] = title
                if module_id is not None:
                    self._day_module_id[day] = int(module_id)

    def _index_days(self, days: List[Dict[str, Any]]) -> None:
        for entry in days:
            if entry.get("day") is None:
                continue
            day = int(entry["day"])
            self._days[day] = entry

            # A module stamped on the day itself is authoritative.
            if entry.get("module"):
                self._day_module[day] = str(entry["module"])
            if entry.get("module_id") is not None:
                self._day_module_id[day] = int(entry["module_id"])

    # --- lookups ------------------------------------------------------------

    def get_day(self, day: int) -> Optional[Dict[str, Any]]:
        return self._days.get(int(day))

    def has_day(self, day: int) -> bool:
        return int(day) in self._days

    def get_title(self, day: int) -> str:
        return self._days.get(int(day), {}).get("title", f"Day {day}")

    def get_module(self, day: int) -> str:
        return self._day_module.get(int(day), "")

    def get_module_id(self, day: int) -> Optional[int]:
        return self._day_module_id.get(int(day))

    def get_type(self, day: int) -> str:
        return self._days.get(int(day), {}).get("type", "")

    def get_objectives(self, day: int) -> List[str]:
        return list(self._days.get(int(day), {}).get("objectives", []) or [])

    def get_tools(self, day: int) -> List[str]:
        return list(self._days.get(int(day), {}).get("tools", []) or [])

    def all_days(self) -> List[int]:
        return sorted(self._days.keys())

    def days_in_module(self, module_id: int) -> List[int]:
        return sorted(
            day for day, mid in self._day_module_id.items() if mid == int(module_id)
        )

    def module_titles(self) -> List[str]:
        return [m["title"] for m in self.modules]

    # --- rendering ----------------------------------------------------------

    def summarize_day(self, day: int) -> str:
        """One-line description of a day, for embedding in LLM prompts."""
        entry = self.get_day(day)
        if not entry:
            return f"Day {day}"
        tools = ", ".join(self.get_tools(day)[:4])
        module = self.get_module(day)
        line = f"Day {day} — {entry.get('title')}"
        if module:
            line += f" ({module})"
        if tools:
            line += f" | tools: {tools}"
        return line

    def describe_day(self, day: int) -> str:
        """Full multi-line description: title, module, tools, objectives."""
        entry = self.get_day(day)
        if not entry:
            return f"Day {day} — not in the curriculum."

        lines = [self.summarize_day(day)]
        objectives = self.get_objectives(day)
        if objectives:
            lines.extend(f"  - {objective}" for objective in objectives)
        return "\n".join(lines)


# Module-level singleton: the curriculum is static, so load it once.
curriculum = Curriculum()
