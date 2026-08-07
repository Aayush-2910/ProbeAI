"""Thin Gemini wrapper: lazy client, retries, and safe JSON parsing.

Both the conversation engine and the feedback generator talk to Gemini through
here so retry/parse behaviour lives in exactly one place.
"""

import json
import re
import time
from typing import Any, Dict, List, Optional

from google import genai
from google.genai import types

from config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLM_MAX_RETRIES,
    LLM_RETRY_BACKOFF_SECONDS,
    MAX_OUTPUT_TOKENS,
)

_client: Optional[genai.Client] = None

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class LLMError(RuntimeError):
    """Raised when Gemini cannot be reached or returns nothing usable."""


def get_client() -> genai.Client:
    global _client
    if _client is None:
        if not GEMINI_API_KEY:
            raise LLMError(
                "GEMINI_API_KEY is not set. Add it to backend/.env or export it "
                "before starting the server."
            )
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def _to_contents(history: List[Dict[str, str]]) -> List[types.Content]:
    """Convert our history format to Gemini contents.

    We store roles as 'assistant' (the interviewer) and 'user' (the candidate);
    Gemini expects 'model' and 'user'.
    """
    contents: List[types.Content] = []
    for message in history:
        role = "model" if message["role"] in ("assistant", "model") else "user"
        text = message.get("content") or ""
        if not text.strip():
            continue
        contents.append(types.Content(role=role, parts=[types.Part(text=text)]))
    return contents


def generate(
    system_instruction: str,
    history: List[Dict[str, str]],
    temperature: float,
    response_schema: Any = None,
) -> str:
    """Call Gemini and return the raw text response."""
    client = get_client()

    config_kwargs: Dict[str, Any] = {
        "system_instruction": system_instruction,
        "temperature": temperature,
        "max_output_tokens": MAX_OUTPUT_TOKENS,
    }
    if response_schema is not None:
        config_kwargs["response_mime_type"] = "application/json"
        config_kwargs["response_schema"] = response_schema

    contents = _to_contents(history)
    if not contents:
        contents = [types.Content(role="user", parts=[types.Part(text="Begin.")])]

    last_error: Optional[Exception] = None
    for attempt in range(LLM_MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(**config_kwargs),
            )
            text = (response.text or "").strip()
            if text:
                return text
            last_error = LLMError("Gemini returned an empty response")
        except Exception as exc:  # noqa: BLE001 - surfaced as LLMError below
            last_error = exc

        if attempt < LLM_MAX_RETRIES - 1:
            time.sleep(LLM_RETRY_BACKOFF_SECONDS * (attempt + 1))

    raise LLMError(f"Gemini call failed after {LLM_MAX_RETRIES} attempts: {last_error}")


def generate_json(
    system_instruction: str,
    history: List[Dict[str, str]],
    temperature: float,
    response_schema: Any = None,
) -> Dict[str, Any]:
    """Call Gemini expecting JSON back, and parse it defensively."""
    raw = generate(system_instruction, history, temperature, response_schema)
    return parse_json(raw)


def parse_json(raw: str) -> Dict[str, Any]:
    """Parse model output that should be JSON, tolerating code fences/preamble."""
    text = _FENCE_RE.sub("", raw.strip()).strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # Fall back to the first balanced {...} block in the output.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    raise LLMError(f"Could not parse JSON from model output: {raw[:300]}")
