"""LLM client — provider-agnostic.

Every agent calls `generate()` or `generate_json()`. Which vendor answers is a
configuration detail (`LLM_PROVIDER=gemini|groq`), isolated here so a provider
switch never touches agent code.

The two providers genuinely differ, and the differences are why this layer
exists rather than being a thin passthrough:

    structured output   Gemini takes a Pydantic class as `response_schema`.
                        Groq is OpenAI-shaped and takes
                        `response_format={"type": "json_object"}` instead.
    tools               Gemini uses `function_declarations`; Groq uses the
                        OpenAI `tools` array. `tools/registry.py` renders both.
    schema + tools      Gemini rejects the combination outright. Groq permits
                        it, but we refuse it everywhere so agent behaviour does
                        not silently change with the provider.

`parse_json` is deliberately tolerant of code fences and prose preamble,
because JSON-mode enforcement varies between providers and models.
"""

import json
import re
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Sequence

from config import (
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GROQ_API_KEY,
    GROQ_MODEL,
    LLM_MAX_RETRIES,
    LLM_PROVIDER,
    LLM_RETRY_BACKOFF_SECONDS,
    LLM_TIMEOUT_SECONDS,
    MAX_OUTPUT_TOKENS,
)
from logging_config import get_logger

logger = get_logger("llm")

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


class LLMError(RuntimeError):
    """The provider could not be reached, or returned nothing usable."""


class LLMConfigError(LLMError):
    """Misconfiguration — a missing key, unknown provider, or invalid request."""


# --- Providers --------------------------------------------------------------


class _Provider(ABC):
    name: str = "abstract"
    model: str = ""

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    def complete(
        self,
        system_instruction: str,
        history: Sequence[Dict[str, str]],
        temperature: float,
        max_output_tokens: int,
        response_schema: Any = None,
        tools: Optional[List[Any]] = None,
    ) -> str:
        """Return the model's text response, or raise."""


class GeminiProvider(_Provider):
    name = "gemini"

    def __init__(self) -> None:
        self.model = GEMINI_MODEL
        self._client: Any = None

    def is_configured(self) -> bool:
        return bool(GEMINI_API_KEY)

    def _client_or_raise(self) -> Any:
        if self._client is None:
            if not GEMINI_API_KEY:
                raise LLMConfigError(
                    "GEMINI_API_KEY is not set. Add it to backend/.env locally, "
                    "or set it in the Render dashboard."
                )
            from google import genai

            self._client = genai.Client(api_key=GEMINI_API_KEY)
        return self._client

    def complete(self, system_instruction, history, temperature, max_output_tokens,
                 response_schema=None, tools=None) -> str:
        client = self._client_or_raise()
        from google.genai import types

        contents = []
        for message in history:
            text = (message.get("content") or "").strip()
            if not text:
                continue
            role = "model" if message.get("role") in ("assistant", "model") else "user"
            contents.append(types.Content(role=role, parts=[types.Part(text=text)]))
        if not contents:
            contents = [types.Content(role="user", parts=[types.Part(text="Begin.")])]

        config: Dict[str, Any] = {
            "system_instruction": system_instruction,
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
            "http_options": types.HttpOptions(timeout=int(LLM_TIMEOUT_SECONDS * 1000)),
        }
        if response_schema is not None:
            config["response_mime_type"] = "application/json"
            config["response_schema"] = response_schema
        if tools:
            config["tools"] = tools

        response = client.models.generate_content(
            model=self.model,
            contents=contents,
            config=types.GenerateContentConfig(**config),
        )
        return (response.text or "").strip()


class GroqProvider(_Provider):
    """OpenAI-shaped chat completions.

    Groq has no equivalent of Gemini's Pydantic `response_schema`, so a schema
    request becomes plain JSON mode. The schema is already spelled out in every
    agent's system prompt, and `parse_json` handles the looser output — which is
    exactly why that tolerance was built in.
    """

    name = "groq"

    def __init__(self) -> None:
        self.model = GROQ_MODEL
        self._client: Any = None

    def is_configured(self) -> bool:
        return bool(GROQ_API_KEY)

    def _client_or_raise(self) -> Any:
        if self._client is None:
            if not GROQ_API_KEY:
                raise LLMConfigError(
                    "GROQ_API_KEY is not set but LLM_PROVIDER=groq. Add the key "
                    "to backend/.env, or switch LLM_PROVIDER back to gemini."
                )
            try:
                from groq import Groq
            except ImportError as exc:  # pragma: no cover - depends on install
                raise LLMConfigError(
                    "LLM_PROVIDER=groq requires the 'groq' package. "
                    "Add groq to requirements.txt and reinstall."
                ) from exc

            self._client = Groq(api_key=GROQ_API_KEY, timeout=LLM_TIMEOUT_SECONDS)
        return self._client

    def complete(self, system_instruction, history, temperature, max_output_tokens,
                 response_schema=None, tools=None) -> str:
        client = self._client_or_raise()

        messages: List[Dict[str, Any]] = [{"role": "system", "content": system_instruction}]
        for message in history:
            text = (message.get("content") or "").strip()
            if not text:
                continue
            role = "assistant" if message.get("role") in ("assistant", "model") else "user"
            messages.append({"role": role, "content": text})
        if len(messages) == 1:
            messages.append({"role": "user", "content": "Begin."})

        kwargs: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_output_tokens,
        }
        if response_schema is not None:
            kwargs["response_format"] = {"type": "json_object"}
        if tools:
            kwargs["tools"] = tools

        response = client.chat.completions.create(**kwargs)
        return (response.choices[0].message.content or "").strip()


_PROVIDERS = {"gemini": GeminiProvider, "groq": GroqProvider}
_provider: Optional[_Provider] = None


def get_provider() -> _Provider:
    global _provider
    if _provider is None:
        factory = _PROVIDERS.get(LLM_PROVIDER)
        if factory is None:
            raise LLMConfigError(
                f"Unknown LLM_PROVIDER '{LLM_PROVIDER}'. "
                f"Expected one of: {', '.join(sorted(_PROVIDERS))}."
            )
        _provider = factory()
    return _provider


def reset_provider() -> None:
    """Drop the cached provider. Used by tests that swap configuration."""
    global _provider
    _provider = None


# --- Public API -------------------------------------------------------------


def generate(
    system_instruction: str,
    history: Sequence[Dict[str, str]],
    temperature: float,
    response_schema: Any = None,
    tools: Optional[List[Any]] = None,
    max_output_tokens: int = MAX_OUTPUT_TOKENS,
    label: str = "llm",
) -> str:
    """Call the configured provider, retrying transient failures."""
    if response_schema is not None and tools:
        # Gemini refuses this outright. Groq allows it, but permitting it would
        # mean agent behaviour changed with the provider — so it is refused for
        # both. Do it in two phases: tool-calling turn, then structured turn.
        raise LLMConfigError(
            "response_schema cannot be combined with tools. Run a tool-calling "
            "turn first, then a separate structured turn."
        )

    provider = get_provider()
    last_error: Optional[Exception] = None
    started = time.time()

    for attempt in range(1, LLM_MAX_RETRIES + 1):
        try:
            text = provider.complete(
                system_instruction, history, temperature,
                max_output_tokens, response_schema, tools,
            )
            if text:
                logger.info(
                    "llm call ok",
                    extra={
                        "event": "llm.ok", "provider": provider.name, "label": label,
                        "attempt": attempt, "chars": len(text),
                        "duration_ms": int((time.time() - started) * 1000),
                    },
                )
                return text
            # Empty text on a successful call: a safety block, or the response
            # hitting the token ceiling mid-object. Both are worth retrying.
            last_error = LLMError("provider returned an empty response")
        except LLMConfigError:
            raise  # never retry a misconfiguration
        except Exception as exc:  # noqa: BLE001 — re-raised as LLMError below
            last_error = exc

        logger.warning(
            "llm call failed",
            extra={"event": "llm.retry", "provider": provider.name, "label": label,
                   "attempt": attempt, "error": str(last_error)},
        )
        if attempt < LLM_MAX_RETRIES:
            time.sleep(LLM_RETRY_BACKOFF_SECONDS * attempt)

    raise LLMError(
        f"{label}: {provider.name} failed after {LLM_MAX_RETRIES} attempts: {last_error}"
    )


def generate_json(
    system_instruction: str,
    history: Sequence[Dict[str, str]],
    temperature: float,
    response_schema: Any = None,
    label: str = "llm",
) -> Dict[str, Any]:
    """Call the provider expecting a JSON object, and parse it defensively."""
    return parse_json(
        generate(system_instruction, history, temperature,
                 response_schema=response_schema, label=label)
    )


def parse_json(raw: str) -> Dict[str, Any]:
    """Parse output that should be a JSON object.

    Tolerates fences and leading prose: JSON-mode enforcement differs between
    providers, and the corrective-retry paths send plain text either way.
    """
    text = _FENCE_RE.sub("", raw.strip()).strip()

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass

    raise LLMError(f"Could not parse JSON from model output: {raw[:300]}")


def is_configured() -> bool:
    """Whether the active provider has a key — surfaced by the health check."""
    try:
        return get_provider().is_configured()
    except LLMConfigError:
        return False


def provider_name() -> str:
    try:
        return get_provider().name
    except LLMConfigError:
        return f"invalid:{LLM_PROVIDER}"


def active_model() -> str:
    try:
        return get_provider().model
    except LLMConfigError:
        return "unknown"
