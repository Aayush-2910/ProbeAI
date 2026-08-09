"""Candidate repository.

Serves the sample profiles behind GET /api/candidates, which is what fills the
frontend's picker. The supplied file wraps the list in a `{"candidates": [...]}`
envelope; an earlier variant was a bare array. Both load, and either way this
module hands back a plain list — the frontend drops anything that is not an
array, so returning the envelope would empty the picker with no error anywhere.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import CANDIDATES_PATH
from logging_config import get_logger

logger = get_logger("candidates")


def _unwrap(raw: Any) -> List[Dict[str, Any]]:
    """Accept either a bare list or a {"candidates": [...]} envelope."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        for key in ("candidates", "data", "items"):
            value = raw.get(key)
            if isinstance(value, list):
                return value
    return []


class CandidateRepository:
    def __init__(self, path: Path = CANDIDATES_PATH):
        self.path = path
        self._candidates: List[Dict[str, Any]] = []
        self._by_id: Dict[str, Dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                raw = json.load(f)
        except FileNotFoundError:
            logger.error(
                "candidates file missing",
                extra={"event": "candidates.missing", "path": str(self.path)},
            )
            return
        except json.JSONDecodeError as exc:
            logger.error(
                "candidates file is not valid JSON",
                extra={"event": "candidates.invalid", "path": str(self.path), "error": str(exc)},
            )
            return

        self._candidates = _unwrap(raw)
        self._by_id = {
            str(c.get("member", {}).get("id")): c
            for c in self._candidates
            if c.get("member", {}).get("id")
        }

        if not self._candidates:
            logger.warning(
                "no candidates parsed",
                extra={"event": "candidates.empty", "path": str(self.path)},
            )
        else:
            logger.info(
                "candidates loaded",
                extra={
                    "event": "candidates.loaded",
                    "count": len(self._candidates),
                    "path": str(self.path),
                },
            )

    def all(self) -> List[Dict[str, Any]]:
        return self._candidates

    def get(self, candidate_id: str) -> Optional[Dict[str, Any]]:
        return self._by_id.get(str(candidate_id))

    def ids(self) -> List[str]:
        return list(self._by_id.keys())

    def __len__(self) -> int:
        return len(self._candidates)


candidates = CandidateRepository()
