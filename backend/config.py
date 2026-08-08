"""Central configuration for ProbeAI.

Every tunable value and environment lookup lives here so the rest of the
package stays free of magic numbers and `os.getenv` calls.

Deployment shape this is written for:
  frontend -> Vercel (static React build, separate origin)
  backend  -> Render (this FastAPI app, containerised)
  sessions -> in-memory by default, Supabase when SESSION_BACKEND=supabase
"""

import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv

# --- Paths ------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent
DATA_DIR = BASE_DIR / "data"

CURRICULUM_PATH = Path(os.getenv("CURRICULUM_PATH") or DATA_DIR / "curriculum.json")
CANDIDATES_PATH = Path(os.getenv("CANDIDATES_PATH") or DATA_DIR / "candidates.json")

# backend/.env wins over a repo-root .env; neither is required in production,
# where Render injects the environment directly.
load_dotenv(BASE_DIR / ".env")
load_dotenv(REPO_ROOT / ".env")


# --- Env helpers ------------------------------------------------------------


def _env(name: str, default: str = "") -> str:
    """Read an env var, treating blank as unset.

    A .env template ships with `SOME_KEY=` on its own line, and an empty string
    is the user saying "I have not filled this in" — not "the value is empty".
    Returning "" there would silently override a perfectly good default, which
    is how ELEVENLABS_VOICE_ID ended up blank instead of falling back to the
    stock voice. Secrets are unaffected: their default is "" either way.
    """
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    return value.strip()


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name) or default)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name) or default)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = _env(name).lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def _env_list(name: str, default: List[str]) -> List[str]:
    raw = _env(name)
    if not raw:
        return list(default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# --- Runtime ----------------------------------------------------------------

APP_NAME = "ProbeAI"
APP_VERSION = "2.0.0"

# Render injects PORT; everything else defaults to a sane local value.
PORT = _env_int("PORT", 8000)
LOG_LEVEL = _env("LOG_LEVEL", "INFO").upper()
LOG_JSON = _env_bool("LOG_JSON", True)

# The frontend lives on a different origin (Vercel), so CORS is load-bearing
# rather than a formality. "*" is the safe default for a public, unauthenticated
# demo API; set CORS_ORIGINS to the Vercel URL to lock it down.
CORS_ORIGINS = _env_list("CORS_ORIGINS", ["*"])


# --- LLM provider -----------------------------------------------------------

# "groq" or "gemini". Groq is primary. The two differ in how JSON output and
# tools are requested, so the difference is isolated in core/llm.py behind one
# interface rather than leaking into the agents.
LLM_PROVIDER = _env("LLM_PROVIDER", "groq").lower()

GEMINI_API_KEY = _env("GEMINI_API_KEY")
GEMINI_MODEL = _env("GEMINI_MODEL", "gemini-2.5-flash")

GROQ_API_KEY = _env("GROQ_API_KEY")
# Left unset by default: Groq retires model ids fairly often, so the right one
# should be confirmed against their current list rather than baked in here.
GROQ_MODEL = _env("GROQ_MODEL", "llama-3.3-70b-versatile")


def active_model() -> str:
    return GROQ_MODEL if LLM_PROVIDER == "groq" else GEMINI_MODEL

# Each agent gets its own temperature: the interviewer should sound human, the
# evaluator and feedback agents must stay anchored to what actually happened.
INTERVIEWER_TEMPERATURE = _env_float("INTERVIEWER_TEMPERATURE", 0.8)
EVALUATOR_TEMPERATURE = _env_float("EVALUATOR_TEMPERATURE", 0.2)
FEEDBACK_TEMPERATURE = _env_float("FEEDBACK_TEMPERATURE", 0.3)

MAX_OUTPUT_TOKENS = _env_int("MAX_OUTPUT_TOKENS", 2048)
LLM_MAX_RETRIES = _env_int("LLM_MAX_RETRIES", 3)
LLM_RETRY_BACKOFF_SECONDS = _env_float("LLM_RETRY_BACKOFF_SECONDS", 1.5)
LLM_TIMEOUT_SECONDS = _env_float("LLM_TIMEOUT_SECONDS", 45.0)


# --- Voice (ElevenLabs) -----------------------------------------------------
#
# Voice lives on its own endpoints. POST /api/interview is fixed by
# technical-spec.md to return {reply, done, feedback} and must not change shape
# to carry audio, so speech is a separate concern layered beside it.

VOICE_ENABLED = _env_bool("VOICE_ENABLED", True)
ELEVENLABS_API_KEY = _env("ELEVENLABS_API_KEY")
ELEVENLABS_BASE_URL = _env("ELEVENLABS_BASE_URL", "https://api.elevenlabs.io/v1")

# "Rachel" — a long-standing ElevenLabs stock voice, used so the feature works
# before anyone picks one. Override with any voice id from your account.
ELEVENLABS_VOICE_ID = _env("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

# Turbo keeps latency low, which matters when a person is waiting to hear the
# next interview question.
ELEVENLABS_TTS_MODEL = _env("ELEVENLABS_TTS_MODEL", "eleven_turbo_v2_5")
ELEVENLABS_STT_MODEL = _env("ELEVENLABS_STT_MODEL", "scribe_v1")
ELEVENLABS_OUTPUT_FORMAT = _env("ELEVENLABS_OUTPUT_FORMAT", "mp3_44100_128")

VOICE_TIMEOUT_SECONDS = _env_float("VOICE_TIMEOUT_SECONDS", 60.0)
# Guards against a stuck recorder uploading something enormous.
VOICE_MAX_UPLOAD_MB = _env_float("VOICE_MAX_UPLOAD_MB", 25.0)
# TTS is billed per character; interview questions are short by design.
VOICE_MAX_TTS_CHARS = _env_int("VOICE_MAX_TTS_CHARS", 5000)


# --- RAG / vector store -----------------------------------------------------

RAG_ENABLED = _env_bool("RAG_ENABLED", True)
RAG_COLLECTION = _env("RAG_COLLECTION", "curriculum_objectives")
RAG_TOP_K = _env_int("RAG_TOP_K", 5)

# Chroma's built-in embedding function is all-MiniLM-L6-v2 running on
# onnxruntime (~80MB). The sentence-transformers package ships the same model
# but drags in PyTorch (~2.5GB), which does not fit Render's free tier.
RAG_EMBEDDING = _env("RAG_EMBEDDING", "chroma-default")


# --- Sessions ---------------------------------------------------------------

# "memory" keeps sessions in a process-local dict. That is correct only with a
# single worker: with 2+ workers, requests round-robin and a session created on
# worker A is invisible to worker B. Use "supabase" to run multi-worker.
SESSION_BACKEND = _env("SESSION_BACKEND", "memory").lower()

SESSION_TTL_MINUTES = _env_int("SESSION_TTL_MINUTES", 30)
COMPLETED_SESSION_TTL_MINUTES = _env_int("COMPLETED_SESSION_TTL_MINUTES", 5)
SESSION_CLEANUP_INTERVAL_SECONDS = _env_int("SESSION_CLEANUP_INTERVAL_SECONDS", 300)

SUPABASE_URL = _env("SUPABASE_URL")
SUPABASE_SERVICE_KEY = _env("SUPABASE_SERVICE_KEY")
SUPABASE_SESSIONS_TABLE = _env("SUPABASE_SESSIONS_TABLE", "interview_sessions")


# --- Interview shape --------------------------------------------------------

MIN_QUESTIONS = _env_int("MIN_QUESTIONS", 8)    # hard floor before ending
MAX_QUESTIONS = _env_int("MAX_QUESTIONS", 12)   # hard ceiling: wrap up regardless
MIN_TOPICS = _env_int("MIN_TOPICS", 4)          # distinct curriculum days to cover

PLAN_MIN_TARGETS = 10       # question targets the planner produces
PLAN_MAX_TARGETS = 12
PLAN_MIN_DISTINCT_DAYS = 6  # distinct curriculum days the plan must span
WEAK_AREA_RATIO = 0.6       # ~60% of the plan probes weak/skipped areas

# Candidates only attempted 9-11 of 31 days, so most of the curriculum is a
# "blind spot". Capped hard: the interview is about what they did, not an
# inventory of what they never opened.
MAX_BLIND_SPOT_TARGETS = 2

# Conversation history is summarised past this many turns to bound the prompt.
HISTORY_SUMMARY_THRESHOLD = _env_int("HISTORY_SUMMARY_THRESHOLD", 6)


# --- Difficulty calibration -------------------------------------------------

DIFFICULTY_FOUNDATIONAL = "foundational"
DIFFICULTY_IMPLEMENTATION = "implementation"
DIFFICULTY_ARCHITECTURE = "architecture"

# Matched against the job role with surrounding spaces, so "hr " cannot hit
# "chr..." and "sales" cannot hit "wholesales".
NON_TECHNICAL_ROLE_KEYWORDS = (
    "marketing",
    "hr ",
    "human resources",
    "business analyst",
    "product manager",
    "project manager",
    "sales",
    "operations",
    "recruiter",
    "content",
    "ux researcher",
    "designer",
    "finance",
    "consultant",
    "it support",
)
