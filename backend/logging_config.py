"""Structured logging.

Render captures stdout, so logs are emitted as one JSON object per line: they
stay greppable in the dashboard and parseable by anything downstream. Set
LOG_JSON=false for human-readable output while developing.

Usage:
    logger.info("session started", extra={"session_id": sid, "event": "start"})

Any keyword passed via `extra` lands in the JSON payload alongside the message.
"""

import json
import logging
import sys
from typing import Any, Dict

from config import LOG_JSON, LOG_LEVEL

# Attributes present on every LogRecord. Anything outside this set was passed by
# the caller through `extra=` and belongs in the structured payload.
_RESERVED = frozenset(
    vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys()
) | {"asctime", "message", "taskName"}


class JsonFormatter(logging.Formatter):
    """Render each record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        for key, value in record.__dict__.items():
            if key in _RESERVED or key.startswith("_"):
                continue
            payload[key] = value if _is_jsonable(value) else str(value)

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def _is_jsonable(value: Any) -> bool:
    return isinstance(value, (str, int, float, bool, type(None), list, dict))


def configure() -> None:
    """Install the root handler. Safe to call more than once."""
    formatter: logging.Formatter = (
        JsonFormatter() if LOG_JSON
        else logging.Formatter("%(asctime)s %(levelname)-7s %(name)s | %(message)s")
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(LOG_LEVEL)

    # Uvicorn installs its own handlers; let them bubble up to ours instead so
    # every line in production shares one format.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True

    # httpx logs every Gemini call at INFO, which drowns out our own events.
    logging.getLogger("httpx").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"probeai.{name}")
