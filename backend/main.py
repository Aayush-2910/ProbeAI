"""ProbeAI — FastAPI application.

Deployment shape: this service is API-only. The React frontend is a separate
Vercel deployment on its own origin, so nothing static is mounted here and CORS
is load-bearing rather than decorative.

Routes:
    GET  /               health check (Render probes this)
    GET  /api/health     same payload, for clients that prefer a namespaced path
    GET  /api/candidates the 20 sample profiles, for the frontend picker
    POST /api/interview  the single interview endpoint — start, turn, and end
"""

import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

import logging_config
from config import APP_NAME, APP_VERSION, CORS_ORIGINS, SESSION_BACKEND

logging_config.configure()
logger = logging_config.get_logger("api")

import voice  # noqa: E402
from config import VOICE_MAX_UPLOAD_MB  # noqa: E402
from core import llm  # noqa: E402 — must import after logging is configured
from core.candidates import candidates  # noqa: E402
from core.curriculum import curriculum  # noqa: E402
from core.session import SessionNotFound, cleanup_loop, session_store  # noqa: E402
from models import InterviewRequest, InterviewResponse  # noqa: E402
from rag.vector_store import vector_store  # noqa: E402
from service import InterviewAlreadyFinished, handle  # noqa: E402

STARTED_AT = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the vector index once, and run session cleanup in the background."""
    import asyncio

    # Building the index at import time would make the module unimportable when
    # the model download fails; doing it in lifespan keeps failures observable
    # and lets the store degrade to keyword search on its own terms.
    await asyncio.to_thread(vector_store.build)

    cleanup_task = asyncio.create_task(cleanup_loop())
    logger.info(
        "startup complete",
        extra={
            "event": "app.startup",
            "llm_provider": llm.provider_name(),
            "model": llm.active_model(),
            "llm_key_present": llm.is_configured(),
            "voice_configured": voice.is_configured(),
            "session_backend": SESSION_BACKEND,
            "curriculum_days": len(curriculum.all_days()),
            "candidates": len(candidates),
            **vector_store.stats(),
        },
    )

    try:
        yield
    finally:
        cleanup_task.cancel()
        logger.info("shutdown", extra={"event": "app.shutdown"})


app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="Adaptive AI technical interviewer for the 31-day AI Engineering cohort.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    # No cookies are used, and credentialed requests cannot combine with the
    # "*" origin default, so this stays off deliberately.
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/")
@app.get("/api/health")
async def health() -> Dict[str, Any]:
    """Liveness plus enough state to diagnose a bad deploy from the outside.

    `gemini_key_present` and the vector-store backend are here on purpose: both
    fail silently otherwise, and a service answering 200 while quietly running
    without a key or without embeddings is the failure worth catching early.
    """
    return {
        "status": "ok",
        "app": APP_NAME,
        "version": APP_VERSION,
        "uptime_seconds": round(time.time() - STARTED_AT, 1),
        # Provider-agnostic: which vendor is answering is configuration, and
        # hardcoding "gemini_key_present" here went stale the moment Groq
        # became primary.
        "llm_provider": llm.provider_name(),
        "model": llm.active_model(),
        "llm_key_present": llm.is_configured(),
        "session_backend": session_store.name,
        "active_sessions": await session_store.active_count(),
        "curriculum_days": len(curriculum.all_days()),
        "candidates": len(candidates),
        **vector_store.stats(),
        **voice.status(),
    }


@app.get("/api/candidates")
async def list_candidates() -> List[Dict[str, Any]]:
    """The sample profiles. Always a JSON array — the frontend drops anything else."""
    return candidates.all()


@app.post(
    "/api/interview",
    response_model=InterviewResponse,
    response_model_exclude_none=True,
)
async def interview(request: InterviewRequest) -> InterviewResponse:
    started = time.time()
    try:
        response = await handle(
            request.sessionId,
            candidate=request.candidate.model_dump(exclude_none=True) if request.candidate else None,
            message=request.message,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SessionNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail=f"No interview session found for sessionId '{request.sessionId}'. "
                   "Start one by sending a candidate profile.",
        ) from exc
    except InterviewAlreadyFinished as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Interview '{request.sessionId}' has already finished.",
        ) from exc
    except llm.LLMConfigError as exc:
        # Misconfiguration, not a transient fault — say so plainly rather than
        # letting an operator retry a 503 that will never succeed.
        logger.error(
            "llm misconfigured",
            extra={"event": "api.llm_config", "session_id": request.sessionId, "error": str(exc)},
        )
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except llm.LLMError as exc:
        logger.error(
            "llm failure",
            extra={"event": "api.llm_error", "session_id": request.sessionId, "error": str(exc)},
        )
        raise HTTPException(
            status_code=503,
            detail="The interviewer is temporarily unavailable. Please try again.",
        ) from exc

    logger.info(
        "interview request",
        extra={
            "event": "api.interview",
            "session_id": request.sessionId,
            "phase": "start" if request.candidate else ("end" if response.done else "turn"),
            "duration_ms": int((time.time() - started) * 1000),
            "done": response.done,
        },
    )
    return response


# --- Voice ------------------------------------------------------------------
#
# Separate endpoints on purpose. POST /api/interview is fixed by
# technical-spec.md to return {reply, done, feedback}; carrying audio in it
# would break the graded contract. The frontend composes them:
#   speak  -> POST /api/voice/transcribe  -> text
#   text   -> POST /api/interview         -> reply
#   reply  -> POST /api/voice/speak       -> audio


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1)
    voice_id: str | None = None


def _voice_http_error(exc: voice.VoiceError) -> HTTPException:
    # 501 for "not set up" vs 503 for "set up but failing" — an operator can act
    # on the difference, and the frontend can hide the mic instead of retrying.
    status = 501 if isinstance(exc, voice.VoiceNotConfigured) else 503
    return HTTPException(status_code=status, detail=str(exc))


@app.get("/api/voice/status")
async def voice_status() -> Dict[str, Any]:
    """Lets the frontend decide whether to show the microphone at all."""
    return voice.status()


@app.post("/api/voice/transcribe")
async def voice_transcribe(
    file: UploadFile = File(...),
    language_code: str = Form("eng"),
) -> Dict[str, Any]:
    """Candidate speech -> text, to be sent on to /api/interview."""
    audio = await file.read()

    limit = int(VOICE_MAX_UPLOAD_MB * 1024 * 1024)
    if len(audio) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"Recording is too large ({len(audio) // 1024}KB). "
                   f"Limit is {VOICE_MAX_UPLOAD_MB:.0f}MB.",
        )
    if not audio:
        raise HTTPException(status_code=400, detail="Empty recording.")

    started = time.time()
    try:
        result = await voice.transcribe(
            audio,
            filename=file.filename or "answer.webm",
            content_type=file.content_type or "audio/webm",
            language_code=language_code or None,
        )
    except voice.VoiceError as exc:
        logger.error("transcription failed", extra={"event": "api.stt_error", "error": str(exc)})
        raise _voice_http_error(exc) from exc

    logger.info(
        "transcribe request",
        extra={"event": "api.stt", "bytes": len(audio),
               "duration_ms": int((time.time() - started) * 1000)},
    )
    return result


@app.post("/api/voice/speak")
async def voice_speak(request: SpeakRequest) -> Response:
    """Interviewer text -> spoken audio."""
    started = time.time()
    try:
        audio = await voice.synthesize(request.text, request.voice_id)
    except voice.VoiceError as exc:
        logger.error("synthesis failed", extra={"event": "api.tts_error", "error": str(exc)})
        raise _voice_http_error(exc) from exc

    logger.info(
        "speak request",
        extra={"event": "api.tts", "chars": len(request.text), "bytes": len(audio),
               "duration_ms": int((time.time() - started) * 1000)},
    )
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store", "Content-Length": str(len(audio))},
    )


@app.get("/api/voice/voices")
async def voice_list() -> Dict[str, Any]:
    try:
        return await voice.list_voices()
    except voice.VoiceError as exc:
        raise _voice_http_error(exc) from exc
