"""Loads curriculum.json once at startup and indexes it for fast lookup."""

import json
from typing import Any, Dict, List, Optional

from config import CURRICULUM_PATH


class Curriculum:
    """Indexed view over the 31-day cohort curriculum."""

    def __init__(self, path=CURRICULUM_PATH):
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)

        self.raw: Dict[str, Any] = raw
        self.modules: List[Dict[str, Any]] = raw.get("modules", [])
        self.total_days: int = raw.get("total_days", 31)

        self.day_to_topic: Dict[int, Dict[str, Any]] = {}
        self.day_to_module: Dict[int, str] = {}

        for entry in raw.get("days", []):
            day = int(entry["day"])
            self.day_to_topic[day] = entry
            self.day_to_module[day] = entry.get("module", "")

    # --- lookups ------------------------------------------------------------

    def get_day(self, day: int) -> Optional[Dict[str, Any]]:
        return self.day_to_topic.get(int(day))

    def get_title(self, day: int) -> str:
        return self.day_to_topic.get(int(day), {}).get("title", f"Day {day}")

    def get_module(self, day: int) -> str:
        return self.day_to_module.get(int(day), "")

    def get_objectives(self, day: int) -> List[str]:
        return list(self.day_to_topic.get(int(day), {}).get("objectives", []))

    def get_tools(self, day: int) -> List[str]:
        return list(self.day_to_topic.get(int(day), {}).get("tools", []))

    def all_days(self) -> List[int]:
        return sorted(self.day_to_topic.keys())

    def days_in_module(self, module_id: int) -> List[int]:
        return [
            d for d, entry in sorted(self.day_to_topic.items())
            if entry.get("module_id") == module_id
        ]

    def summarize_day(self, day: int) -> str:
        """One-line description used inside LLM prompts."""
        entry = self.get_day(day)
        if not entry:
            return f"Day {day}"
        tools = ", ".join(entry.get("tools", [])[:4])
        return f"Day {day} — {entry.get('title')} ({entry.get('module')}) | tools: {tools}"


# Module-level singleton: the curriculum is static, load it once.
curriculum = Curriculum()
