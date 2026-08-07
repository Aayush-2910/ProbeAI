"""Central configuration for ProbeAI.

Everything tunable lives here so the rest of the modules stay free of magic
numbers and environment lookups.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# --- Paths ------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
CURRICULUM_PATH = DATA_DIR / "curriculum.json"
CANDIDATES_PATH = DATA_DIR / "candidates.json"

# --- Gemini -----------------------------------------------------------------

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# The interviewer should sound human, so it runs warmer than the evaluator,
# which needs to stay grounded in what actually happened in the transcript.
CONVERSATION_TEMPERATURE = float(os.getenv("CONVERSATION_TEMPERATURE", "0.8"))
FEEDBACK_TEMPERATURE = float(os.getenv("FEEDBACK_TEMPERATURE", "0.3"))

MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "2048"))
LLM_MAX_RETRIES = int(os.getenv("LLM_MAX_RETRIES", "3"))
LLM_RETRY_BACKOFF_SECONDS = float(os.getenv("LLM_RETRY_BACKOFF_SECONDS", "1.5"))

# --- Interview shape --------------------------------------------------------

MIN_QUESTIONS = 8          # hard floor before the interview may end
MAX_QUESTIONS = 12         # hard ceiling: wrap up no matter what
MIN_TOPICS = 4             # distinct curriculum days that must be covered

PLAN_MIN_TARGETS = 10      # question targets the planner generates
PLAN_MAX_TARGETS = 12
PLAN_MIN_DISTINCT_DAYS = 6 # distinct curriculum days the plan must span
WEAK_AREA_RATIO = 0.6      # ~60% of the plan probes weak/skipped areas

# --- Difficulty calibration -------------------------------------------------

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
)

DIFFICULTY_FOUNDATIONAL = "foundational"
DIFFICULTY_IMPLEMENTATION = "implementation"
DIFFICULTY_ARCHITECTURE = "architecture"
