"""Voice — ElevenLabs speech-to-text and text-to-speech.

Turn-based voice, deliberately: the candidate speaks, Scribe transcribes, the
existing interview pipeline runs unchanged, and the reply is spoken back.

Why not ElevenLabs Conversational AI (their realtime agent)? Because that agent
runs its own LLM inside ElevenLabs. Routing the interview through it would
bypass the planner, evaluator, interviewer and feedback agents, the RAG layer
and all 192 authored questions — every part that makes this an interviewer
rather than a chatbot with a microphone. Transcription and synthesis stay as
thin edges around the existing brain.

HTTP is called directly with httpx rather than through the ElevenLabs SDK: one
fewer dependency in the container, and explicit control over timeouts, which
matter when someone is waiting to hear the next question.
"""

from typing import Any, Dict, Optional

import httpx

from config import (
    ELEVENLABS_API_KEY,
    ELEVENLABS_BASE_URL,
    ELEVENLABS_OUTPUT_FORMAT,
    ELEVENLABS_STT_MODEL,
    ELEVENLABS_TTS_MODEL,
    ELEVENLABS_VOICE_ID,
    VOICE_ENABLED,
    VOICE_MAX_TTS_CHARS,
    VOICE_TIMEOUT_SECONDS,
)
from logging_config import get_logger

logger = get_logger("voice")


class VoiceError(RuntimeError):
    """Speech synthesis or transcription failed."""


class VoiceNotConfigured(VoiceError):
    """No ElevenLabs key, or voice is switched off."""


def is_configured() -> bool:
    return bool(VOICE_ENABLED and ELEVENLABS_API_KEY)


def _require() -> None:
    if not VOICE_ENABLED:
        raise VoiceNotConfigured("Voice is disabled. Set VOICE_ENABLED=true in backend/.env.")
    if not ELEVENLABS_API_KEY:
        raise VoiceNotConfigured(
            "ELEVENLABS_API_KEY is not set. Add it to backend/.env, or set "
            "VOICE_ENABLED=false to run text-only."
        )


def _headers() -> Dict[str, str]:
    return {"xi-api-key": ELEVENLABS_API_KEY}


def _explain(response: httpx.Response) -> str:
    """Turn an ElevenLabs error into something actionable.

    Their failures are usually quota, a bad key, or an unknown voice id, and
    the raw body buries that in nested JSON.
    """
    try:
        body = response.json()
        detail = body.get("detail", body)
        if isinstance(detail, dict):
            message = detail.get("message") or detail.get("status") or str(detail)
        else:
            message = str(detail)
    except Exception:  # noqa: BLE001 — fall back to raw text
        message = (response.text or "")[:200]

    if response.status_code == 401:
        # Keys are scoped. A key that synthesises fine can still 401 on
        # /voices if it lacks voices_read, which looks like a bad key but is a
        # missing permission.
        return (
            f"ElevenLabs rejected the key for this operation ({message}). "
            "If speech itself works, the key is valid but missing a permission "
            "scope — enable it in the ElevenLabs dashboard under API Keys."
        )
    if response.status_code == 402:
        return (
            f"ElevenLabs refused this voice on your plan ({message}). "
            "Voice Library voices need a paid plan. Set ELEVENLABS_VOICE_ID to "
            "a voice that works on free: EXAVITQu4vr4xnSDxMaL (Sarah), "
            "pNInz6obpgDQGcFmaJgB (Adam), ErXwobaYiN019PkySvjV (Antoni), "
            "or JBFqnCBsd6RMkjVDRZzb (George)."
        )
    if response.status_code == 404:
        return f"ElevenLabs does not recognise that voice id ({message})."
    if response.status_code == 422:
        return f"ElevenLabs rejected the request ({message})."
    if response.status_code == 429:
        return f"ElevenLabs rate limit or quota exhausted ({message})."
    return f"ElevenLabs returned {response.status_code}: {message}"


async def transcribe(
    audio: bytes,
    filename: str = "answer.webm",
    content_type: str = "audio/webm",
    language_code: Optional[str] = "eng",
) -> Dict[str, Any]:
    """Speech to text. Returns {"text": ..., "language_code": ...}.

    `language_code` is pinned to English by default: the interview is conducted
    in English, and letting Scribe auto-detect on a short noisy clip
    occasionally produces a confident transcription in the wrong language.
    """
    _require()
    if not audio:
        raise VoiceError("No audio received.")

    files = {"file": (filename, audio, content_type)}
    data: Dict[str, str] = {"model_id": ELEVENLABS_STT_MODEL}
    if language_code:
        data["language_code"] = language_code

    try:
        async with httpx.AsyncClient(timeout=VOICE_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{ELEVENLABS_BASE_URL}/speech-to-text",
                headers=_headers(),
                files=files,
                data=data,
            )
    except httpx.TimeoutException as exc:
        raise VoiceError("Transcription timed out. Try a shorter recording.") from exc
    except httpx.HTTPError as exc:
        raise VoiceError(f"Could not reach ElevenLabs: {exc}") from exc

    if response.status_code >= 400:
        raise VoiceError(_explain(response))

    payload = response.json()
    text = (payload.get("text") or "").strip()

    logger.info(
        "transcribed",
        extra={
            "event": "voice.stt",
            "bytes": len(audio),
            "chars": len(text),
            "language": payload.get("language_code"),
        },
    )
    return {
        "text": text,
        "language_code": payload.get("language_code"),
        "empty": not text,
    }


async def synthesize(text: str, voice_id: Optional[str] = None) -> bytes:
    """Text to speech. Returns MP3 bytes."""
    _require()

    clean = (text or "").strip()
    if not clean:
        raise VoiceError("No text to speak.")
    if len(clean) > VOICE_MAX_TTS_CHARS:
        # Billed per character, so truncate loudly rather than silently paying
        # for a wall of audio nobody asked for.
        logger.warning(
            "tts text truncated",
            extra={"event": "voice.tts_truncated", "chars": len(clean),
                   "limit": VOICE_MAX_TTS_CHARS},
        )
        clean = clean[:VOICE_MAX_TTS_CHARS]

    target_voice = voice_id or ELEVENLABS_VOICE_ID

    try:
        async with httpx.AsyncClient(timeout=VOICE_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{ELEVENLABS_BASE_URL}/text-to-speech/{target_voice}",
                headers={**_headers(), "Content-Type": "application/json"},
                params={"output_format": ELEVENLABS_OUTPUT_FORMAT},
                json={
                    "text": clean,
                    "model_id": ELEVENLABS_TTS_MODEL,
                    "voice_settings": {
                        # Higher stability and lower style keep an interviewer
                        # sounding measured rather than theatrical.
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                        "style": 0.0,
                        "use_speaker_boost": True,
                    },
                },
            )
    except httpx.TimeoutException as exc:
        raise VoiceError("Speech synthesis timed out.") from exc
    except httpx.HTTPError as exc:
        raise VoiceError(f"Could not reach ElevenLabs: {exc}") from exc

    if response.status_code >= 400:
        raise VoiceError(_explain(response))

    audio = response.content
    if not audio:
        raise VoiceError("ElevenLabs returned empty audio.")

    logger.info(
        "synthesized",
        extra={"event": "voice.tts", "chars": len(clean), "bytes": len(audio),
               "voice_id": target_voice},
    )
    return audio


async def list_voices() -> Dict[str, Any]:
    """Available voices, so the frontend can offer a picker."""
    _require()
    try:
        async with httpx.AsyncClient(timeout=VOICE_TIMEOUT_SECONDS) as client:
            response = await client.get(f"{ELEVENLABS_BASE_URL}/voices", headers=_headers())
    except httpx.HTTPError as exc:
        raise VoiceError(f"Could not reach ElevenLabs: {exc}") from exc

    if response.status_code >= 400:
        raise VoiceError(_explain(response))

    voices = response.json().get("voices", [])
    return {
        "current": ELEVENLABS_VOICE_ID,
        "voices": [
            {
                "voice_id": v.get("voice_id"),
                "name": v.get("name"),
                "labels": v.get("labels", {}),
                "preview_url": v.get("preview_url"),
            }
            for v in voices
        ],
    }


def status() -> Dict[str, Any]:
    """Surfaced by the health check so a missing key is visible from outside."""
    return {
        "voice_enabled": VOICE_ENABLED,
        "voice_configured": is_configured(),
        "tts_model": ELEVENLABS_TTS_MODEL,
        "stt_model": ELEVENLABS_STT_MODEL,
        "voice_id": ELEVENLABS_VOICE_ID,
    }
