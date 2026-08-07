# ProbeAI — Architecture Specification

**Status:** design frozen for implementation · **Owner:** architecture · **Consumers:** backend team

ProbeAI is an AI-powered technical **interviewer** for graduates of a 31-day AI Engineering cohort.
It is not a quiz engine. It listens, adapts, probes deeper on weak answers, calibrates difficulty to
the candidate's experience, and transitions between topics like a senior engineer would.

---

## 1. Design principles

These are the rules every module is measured against. If an implementation choice conflicts with one
of these, the principle wins.

1. **The plan is deterministic, the conversation is generative.** `interview_planner` is pure Python —
   no LLM. It must be instant, stable, and auditable. The LLM only decides *how* to talk, never *what
   the interview is about*.
2. **The LLM never controls its own exit.** Model judgment is allowed only inside hard-coded
   guardrails (`MIN_QUESTIONS` / `MAX_QUESTIONS` / `MIN_TOPICS`).
3. **One question per message. Always.** Enforced in the prompt, verified in review.
4. **The candidate never sees internal state.** No scores, no plan, no attempt counts, no priorities.
5. **Degrade, don't crash.** A failed evaluator call must not destroy a completed interview.
6. **The API contract is frozen.** Section 3 is non-negotiable; internal refactors must not change it.

**Non-goals (v1):** no database, no auth, no streaming, no frontend, no multi-interviewer, no persistence
across restarts.

---

## 2. Stack & repository layout

| Concern | Choice |
|---|---|
| API | Python 3.11 + FastAPI + Uvicorn |
| LLM | Gemini (`google-genai` SDK), structured JSON output |
| Validation | Pydantic v2 |
| Storage | In-memory `dict`, keyed by `sessionId` |

```
backend/
  main.py                 # FastAPI app, routing, status codes
  config.py               # env, model, tunables, constants
  models.py               # Pydantic schemas (API contract + internal)
  llm_client.py           # Gemini wrapper: retries + JSON parsing
  session_manager.py      # in-memory session store
  curriculum.py           # loads + indexes curriculum.json
  interview_planner.py    # THE BRAIN — candidate analysis → question plan
  conversation_engine.py  # THE INTERVIEWER — per-turn LLM orchestration
  feedback_generator.py   # FINAL ASSESSMENT — one evaluator call
  data/
    curriculum.json       # 31 days × 8 modules
    candidates.json       # 20 sample candidate profiles
scripts/
  preview_plan.py         # print a candidate's plan (no API key needed)
  interview_cli.py        # drive a full interview from the terminal
```

`llm_client.py` is the one addition to the original module list: both `conversation_engine` and
`feedback_generator` call Gemini, and retry/parse logic must not be duplicated.

---

## 3. API contract (frozen)

Single endpoint: **`POST /api/interview`**. Three states, distinguished by which optional field is present.

### State 1 — Start (request carries `candidate`)

```jsonc
// request
{ "sessionId": "abc-123", "candidate": { "member": {...}, "missions": [...], "signals": {...} } }
// response
{ "reply": "Welcome message + first question...", "done": false }
```

### State 2 — Turn (request carries `message`)

```jsonc
{ "sessionId": "abc-123", "message": "Candidate's answer text..." }
{ "reply": "Follow-up or next question...", "done": false }
```

### State 3 — End (server-decided)

```jsonc
{
  "reply": "Closing message...",
  "done": true,
  "feedback": {
    "summary": "2-3 sentence overall assessment",
    "strengths": ["..."], "gaps": ["..."], "next": ["..."]
  }
}
```

`feedback` **must be absent** (not `null`) when `done` is `false` → serialize with
`response_model_exclude_none=True`.

### Supporting endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/health` (alias `/api/health`) | `{"status":"ok","app":"ProbeAI", ...}` health check |
| GET | `/api/candidates` | all 20 sample candidate profiles (frontend dropdown) |
| GET | `/` | the built SPA (`frontend/dist`), mounted last so it cannot shadow the API |

**Root-path note:** health originally lived at `/`, but the frontend must own the root — a judge
opening the URL has to get the app, not JSON. Health moved to `/health` with an `/api/health` alias.
When no frontend build exists, `/` falls back to the health handler so API-only deployments still
answer at the root.

CORS: allow all origins (hackathon scope).

---

## 4. Runtime architecture

```mermaid
flowchart TD
    C[Client] -->|POST /api/interview| M[main.py<br/>routing + status codes]
    M --> SM[session_manager<br/>in-memory dict]
    M -->|first request only| P[interview_planner<br/>THE BRAIN]
    M -->|every turn| CE[conversation_engine<br/>THE INTERVIEWER]
    M -->|once, at end| FG[feedback_generator<br/>ASSESSMENT]
    P --> CUR[curriculum<br/>day index]
    CE --> CUR
    CE --> LLM[llm_client]
    FG --> LLM
    LLM -->|structured JSON| G[(Gemini API)]
    P -.plan.-> SM
    CE -.history, counters.-> SM
```

**Dependency rule:** arrows point one way only. `curriculum`, `config`, `models` are leaves —
they import nothing from the app. `session_manager` never imports the engine. No cycles.

---

## 5. Request lifecycle

```mermaid
sequenceDiagram
    participant C as Client
    participant M as main
    participant P as planner
    participant E as engine
    participant F as feedback
    participant G as Gemini

    C->>M: sessionId + candidate
    M->>P: create_plan(candidate, curriculum)
    P-->>M: ordered plan (10-13 targets)
    M->>E: generate_opening(session)
    E->>G: system(persona+plan+rules+opening) 
    G-->>E: {reply, curriculum_day, ...}
    E-->>M: welcome + Q1
    M-->>C: {reply, done:false}

    loop each answer
        C->>M: sessionId + message
        M->>E: process_turn(session, message)
        E->>G: system(persona+plan+progress+closing directive) + full history
        G-->>E: {reply, curriculum_day, is_followup, answer_quality, is_closing}
        E-->>M: TurnResult(reply, should_end)
        alt should_end
            M->>F: generate(session)
            F->>G: evaluator prompt + full transcript
            G-->>F: {summary, strengths, gaps, next}
            M-->>C: {reply, done:true, feedback}
        else
            M-->>C: {reply, done:false}
        end
    end
```

---

## 6. Session state

One dict per `sessionId`. Created in State 1, mutated on every turn, never persisted.

| Key | Type | Written by | Purpose |
|---|---|---|---|
| `session_id` | `str` | manager | identity |
| `candidate` | `dict` | manager | full profile as received |
| `interview_plan` | `list[dict]` | planner | ordered question targets |
| `conversation_history` | `list[{role, content}]` | engine | `assistant` / `user` turns, verbatim |
| `question_count` | `int` | engine | questions asked (opening counts as 1) |
| `topics_covered` | `set[int]` | engine | distinct curriculum days questioned |
| `last_question_day` | `int \| None` | engine | day the pending answer belongs to |
| `answer_evaluations` | `list[dict]` | engine | `{day, quality, followup, question_number}` |
| `status` | `"active" \| "completed"` | main | rejects turns after the end |

`topics_covered` is a `set` — never serialize the session object directly into a response.

---

## 7. Module contracts

Each module below is independently implementable against these signatures. **Build to the signature,
not to the neighbouring implementation.**

### 7.1 `config.py`
Env loading (`GEMINI_API_KEY`, `GEMINI_MODEL`) plus every tunable. No logic, no imports from the app.

Exports: `CURRICULUM_PATH`, `CANDIDATES_PATH`, `GEMINI_MODEL`, `CONVERSATION_TEMPERATURE` (0.8),
`FEEDBACK_TEMPERATURE` (0.3), `MAX_OUTPUT_TOKENS`, `LLM_MAX_RETRIES`, `MIN_QUESTIONS` (8),
`MAX_QUESTIONS` (12), `MIN_TOPICS` (4), `PLAN_MIN_TARGETS` (10), `PLAN_MAX_TARGETS` (12),
`PLAN_MIN_DISTINCT_DAYS` (6), `WEAK_AREA_RATIO` (0.6), `NON_TECHNICAL_ROLE_KEYWORDS`,
`DIFFICULTY_*`.

### 7.2 `models.py`
Pydantic v2 schemas. Candidate sub-models use `extra="allow"` so an unexpected profile field never
400s a valid interview.

```python
InterviewRequest(sessionId: str, candidate: Candidate | None, message: str | None)
InterviewResponse(reply: str, done: bool = False, feedback: FeedbackModel | None = None)
FeedbackModel(summary: str, strengths: list[str], gaps: list[str], next: list[str])
Candidate(member: Member, missions: list[Mission], signals: Signals)
Member(id, name, jobRole, yearsExperience, education, status)
Mission(day: int, title: str|None, passed: bool|None, attempts: int|None, skipped: bool|None)
Signals(commitDays, missionsCompleted, missionsFirstTry)
TurnResult(reply: str, should_end: bool, meta: dict | None)   # internal
```

### 7.3 `curriculum.py`
Loads `curriculum.json` **once** at import; module-level singleton `curriculum`.

```python
class Curriculum:
    day_to_topic: dict[int, dict]        # full day object
    day_to_module: dict[int, str]
    get_day(day) -> dict | None
    get_title(day) -> str
    get_module(day) -> str
    get_objectives(day) -> list[str]
    get_tools(day) -> list[str]
    all_days() -> list[int]
    summarize_day(day) -> str            # one line, for prompts
```

**Done when:** every day 1–31 resolves to a title, module, ≥3 objectives, and ≥1 tool.

### 7.4 `session_manager.py`

```python
create_session(session_id, candidate) -> dict     # initializes all keys in §6
get_session(session_id) -> dict                   # raises HTTPException(404) if absent
update_session(session_id, updates) -> dict
append_message(session, role, content) -> None
record_question(session, day) -> None             # +1 count, add day, set last_question_day
record_evaluation(session, evaluation) -> None
```

**Done when:** a missing session raises 404 with an actionable message; counters only move through
these methods (no ad-hoc mutation from the engine).

### 7.5 `interview_planner.py` — THE BRAIN
Runs **once** per session. Pure functions, no LLM, no I/O. Full algorithm in §9.

```python
create_plan(candidate: dict, curric: Curriculum) -> list[dict]
calibrate_difficulty(candidate: dict) -> str
profile_missions(candidate, curric) -> list[dict]
find_blind_spots(profiled, curric) -> list[dict]
build_candidate_brief(candidate, curric) -> str   # prose, used in prompts
summarize_plan(plan) -> str                       # plan rendered for prompts
```

Plan item shape:

```python
{
  "order": 1, "curriculum_day": 12, "module": "LLM Core, Prompting & Fine-Tuning",
  "topic_title": "Prompt Engineering Fundamentals",
  "priority": "MEDIUM-HIGH", "difficulty_level": "implementation",
  "objectives_to_probe": ["zero-shot vs few-shot", "chain-of-thought"],
  "tools": ["OpenAI", "prompt templates"],
  "candidate_signal": "passed but needed 4 attempts",
  "suggested_question": "When you were designing your system prompt...",
  "role": "opening" | "probe" | "synthesis"
}
```

**Done when:** all 20 sample candidates yield 10–13 targets spanning ≥6 distinct days, item 1 has
`role="opening"`, the last has `role="synthesis"`, and every item has a non-empty
`suggested_question`.

### 7.6 `conversation_engine.py` — THE INTERVIEWER
Runs on **every** turn. Prompt composition in §10, exit rules in §8.

```python
generate_opening(session) -> str                      # welcome + Q1 in one message
process_turn(session, message: str | None) -> TurnResult
build_system_prompt(session, opening: bool = False) -> str
```

Behaviour spec:
1. Append the candidate answer to history (empty/whitespace answers become an explicit placeholder).
2. Compute `must_close` / `may_close` from counters **before** the LLM call and inject the matching
   closing directive.
3. Call Gemini with `response_schema=_TurnPayload` and the full history.
4. Validate the payload with defaults — a missing or unknown `curriculum_day` falls back to
   `last_question_day`; only an empty `reply` is fatal.
5. Record the evaluation of the answer under `last_question_day`; record the *new* question under
   the returned `curriculum_day` — but only when the interview is not ending.
6. Return `TurnResult(reply, should_end, meta)`.

**Done when:** the opening always contains a question; a vague answer produces a same-topic follow-up;
`should_end` is never `true` before `MIN_QUESTIONS`/`MIN_TOPICS` and always `true` at `MAX_QUESTIONS`.

### 7.7 `feedback_generator.py` — FINAL ASSESSMENT
Runs **once**, in a separate LLM call at `FEEDBACK_TEMPERATURE`.

```python
generate(session) -> FeedbackModel
```

Input assembled as: candidate brief (background only, explicitly *not* evidence) + what the interviewer
was probing + coverage + full transcript. Output must be 2–4 items per list, each anchored to a real
moment in the transcript. Vague praise, "study more", and "keep practicing" are defects.

**Fallback:** on `LLMError`, return a deterministic `FeedbackModel` built from `answer_evaluations`
that *states* the evaluator was unavailable. Never fabricate specifics, never propagate the error —
the interview already succeeded.

### 7.8 `llm_client.py`

```python
generate(system_instruction, history, temperature, response_schema=None) -> str
generate_json(system_instruction, history, temperature, response_schema=None) -> dict
parse_json(raw) -> dict          # tolerates code fences and preamble
class LLMError(RuntimeError)
```

Lazy client creation (missing key raises `LLMError`, doesn't break import), `LLM_MAX_RETRIES` attempts
with linear backoff, role mapping `assistant → model`, empty response treated as a failure.

### 7.9 `main.py`

```python
@app.post("/api/interview", response_model=InterviewResponse, response_model_exclude_none=True)
```

Branching exactly as §3; CORS middleware; `GET /`; `GET /api/candidates`; `LLMError → 503`.

---

## 8. Interview state machine

```mermaid
stateDiagram-v2
    [*] --> Active: candidate received → plan built → opening asked
    Active --> Active: answer → follow-up or next topic
    Active --> Completed: exit condition met → closing reply + feedback
    Completed --> [*]
```

Exit is evaluated **before** each LLM call, from server-side counters:

| Condition | Meaning | Effect |
|---|---|---|
| `question_count >= MAX_QUESTIONS` (12) | hard ceiling | `must_close` — prompt forbids another question, `should_end = true` regardless of the model |
| `question_count >= MIN_QUESTIONS` (8) **and** `len(topics_covered) >= MIN_TOPICS` (4) | eligible | `may_close` — model may set `is_closing` if the current topic concluded |
| otherwise | not eligible | prompt requires exactly one question; `is_closing` is ignored |

`should_end = must_close or (may_close and payload.is_closing)`. Target length: 8–12 questions across
4+ curriculum days.

---

## 9. Planner algorithm (normative)

**Step 1 — Profile every mission** against its curriculum day:

| Signal | Priority | Rank |
|---|---|---|
| `skipped: true` | `CRITICAL` | 0 |
| `passed: false` | `HIGH` | 1 |
| `passed: true, attempts >= 4` | `MEDIUM-HIGH` | 2 |
| day absent from `missions` | `BLIND-SPOT` | 3 |
| `passed: true, attempts 2-3` | `MEDIUM` | 4 |
| `passed: true, attempts == 1` | `LOW` | 5 |

**Step 2 — Blind spots.** Days 1–31 not present in `missions`, capped at **2 targets** — the interview
is about what they did, not an inventory of what they never opened.

**Step 3 — Difficulty calibration.** Baseline from role + years, then a one-level performance adjustment:

| Baseline | Rule |
|---|---|
| `foundational` | ≤2 years **or** non-technical role (marketing, HR, business analyst, PM, UX researcher, …) |
| `implementation` | 3–7 years |
| `architecture` | 8+ years |

- **Step down one level** if `failures >= 3` or `first_try_ratio < 0.35`. A title is not evidence of
  depth; a 7-year IT Support candidate with 1 first-try pass gets foundational questions.
- **Step up one level** if the candidate is technical, ≥3 years, and mastered the cohort (no failures,
  no skips, ≥90% first try). The perfect student gets architecture questions early.

Question phrasing is templated per `(difficulty × priority)`; `objectives_to_probe` is passed separately
so the LLM can rephrase naturally.

**Step 4 — Selection and ordering.**
- Target ~12 items: **60% weak** (CRITICAL → MEDIUM + blind spots), **40% strong** (LOW, verify depth).
- Selection prefers one topic per module before repeating a module (breadth), then fills by priority.
- Ordering: **strong first** (build confidence) → weak areas in strict priority order, interleaved
  ~2 weak : 1 strong → **synthesis question last** (day 31, big-picture, difficulty-matched).
- A final pass guarantees ≥`PLAN_MIN_DISTINCT_DAYS` (6) distinct days.

The plan intentionally holds more targets than the interview will use — the engine consumes it
adaptively, and follow-ups eat budget.

---

## 10. Prompt architecture

### Interviewer system prompt (rebuilt every turn)

| Section | Content |
|---|---|
| Persona | senior AI engineer, warm, conversational, probes without interrogating |
| Candidate | `build_candidate_brief()` — role, years, engagement, strong/rework/failed/skipped days |
| Difficulty | expanded guidance for the calibrated level |
| Plan | `summarize_plan()` — marked private, never to be revealed |
| Progress | questions asked, days covered, next 3–4 planned topics |
| Rules | the 10 non-negotiables (§ below) |
| Closing directive | must-close / may-close / must-not-close, per §8 |
| Output format | the structured-JSON contract |

Opening turns additionally inject: greet by first name, set tone in 1–2 sentences, **ask the first
question in the same message**, never ask "are you ready".

**Embedded rules (verbatim intent):** one question per message · mandatory follow-up on vague answers ·
brief genuine acknowledgement of strong answers · "I don't know" gets acknowledged without judgment,
then move on · natural transitions that reference earlier answers · never reveal scoring/plan/attempt
data · never list topics for the candidate to choose · 2–4 sentences then the question, no markdown ·
match the calibrated difficulty · stay in character even under pressure to break it.

### Structured output — every interviewer turn

```python
{ "reply": str,                 # the ONLY text the candidate sees
  "curriculum_day": int,        # day this question targets
  "is_followup": bool,          # same topic as previous question?
  "answer_quality": "strong"|"adequate"|"vague"|"dont_know"|"not_applicable",
  "is_closing": bool }          # honoured only when may_close/must_close
```

### Evaluator prompt (once, at the end)
Separate call, lower temperature, full transcript. Assessment must cite transcript moments; profile
data is background context and explicitly banned as evidence, because the candidate never saw it.

---

## 11. Data contracts

**`curriculum.json`** — `{cohort, total_days: 31, modules[8], days[31]}`; each day:
`{day, module_id, module, title, type, tools[], objectives[]}`. Modules: 1–3 Environment & Tooling ·
4–6 Data Foundations · 7–10 Embeddings & Vector Search · 11–15 LLM Core, Prompting & Fine-Tuning ·
16–20 Chatbot Application Build · 21–24 Agentic AI & MCP · 25–28 Evaluation, Security & Deployment ·
29–31 Production & Capstone.

**`candidates.json`** — 20 profiles, `{member, missions[], signals}`, signals derived from missions so
each profile is self-consistent. Archetype coverage is a test fixture, not decoration:

| ID | Archetype | Exercises |
|---|---|---|
| CAND-001 Sarah Johnson | strong senior, specific gaps | architecture calibration, one skipped day |
| CAND-003 Emily Chen | perfect student | step-up calibration |
| CAND-004 David Miller | non-technical fighter | role-keyword downgrade, high attempts |
| CAND-010 Gerald Combs | struggling but persistent | performance downgrade, multiple failures |
| CAND-011 Mia Alvarez | heavy skipper | CRITICAL-dominated plan + blind spots |
| CAND-006/019 | partial cohort | days absent from `missions` |

---

## 12. Errors & status codes

| Case | Code | Detail |
|---|---|---|
| Unknown `sessionId` on a turn | 404 | how to start a session |
| Neither `candidate` nor `message` | 400 | which field is required |
| Malformed body | 422 | FastAPI validation |
| Turn on a finished interview | 409 | interview already completed |
| Gemini unreachable / unparseable | 503 | "Interviewer is unavailable: …" |
| Evaluator call fails at the end | 200 | degraded feedback, `done: true` preserved |

---

## 13. Work breakdown

Dependency order — everything in a wave is parallelizable.

```mermaid
flowchart LR
    W1["Wave 1 — foundations<br/>config · models · curriculum · data files"] --> W2
    W2["Wave 2 — independent cores<br/>session_manager · llm_client · interview_planner"] --> W3
    W3["Wave 3 — LLM layers<br/>conversation_engine · feedback_generator"] --> W4
    W4["Wave 4 — assembly<br/>main.py · scripts · end-to-end tuning"]
```

| Track | Modules | Depends on | Definition of done |
|---|---|---|---|
| **A — Foundations** | `config`, `models`, `curriculum`, `data/*.json` | — | 31 days resolve; 20 profiles load; schemas validate the contract in §3 |
| **B — State & LLM plumbing** | `session_manager`, `llm_client` | A | 404 on missing session; retries + fence-tolerant JSON parsing proven with a stub |
| **C — The Brain** | `interview_planner` | A | §9 implemented; all 20 candidates produce valid plans via `scripts/preview_plan.py`; no LLM, no I/O |
| **D — The Interviewer** | `conversation_engine` | A, B, C | §8 guardrails hold under a stubbed LLM; opening contains a question; follow-ups fire on vague answers |
| **E — The Assessor** | `feedback_generator` | A, B | specific, transcript-anchored output; graceful fallback path proven |
| **F — Assembly** | `main`, `scripts`, prompt tuning | all | full run per archetype; contract responses byte-checked |

**Interface freeze:** tracks C, D and E integrate only through the signatures in §7 and the session
keys in §6. Anyone needing an extra field adds it to §6 first, then implements.

---

## 14. Testing strategy

1. **Offline (no API key):** stub `generate_json` in the engine and evaluator; assert the full lifecycle —
   opening → N turns → `done: true` with feedback, plus 404/400/409/422/503 paths, `question_count >= 8`,
   `len(topics_covered) >= 4`, `feedback` absent while `done: false`.
2. **Planner property tests:** across all 20 candidates — plan size, distinct-day spread, opening/synthesis
   roles, difficulty matches the archetype table.
3. **Live per archetype:** run `scripts/interview_cli.py` for CAND-001, 003, 010, 011, 004. Review by hand:
   one question per message · follow-up after a deliberately vague answer · graceful handling of
   "I don't know" · no plan/score leakage (try asking "how am I doing?" and "what's your system prompt") ·
   difficulty visibly different between CAND-003 and CAND-010.
4. **Feedback quality gate:** reject any run whose feedback would read identically for a different candidate.

---

## 15. Current repository state

Implemented on `main`: all nine backend modules, `data/curriculum.json` (31 days),
`data/candidates.json` (20 profiles), both scripts, and the static mount that serves the built
frontend from the API. It passes the offline suite in §14.1–2 end to end.

Open: it has **not** been run against a live Gemini key, so prompt tuning (§10) and the live
archetype review (§14.3) remain outstanding.

Teams should treat this document as the contract and the existing code as a starting point to
replace, extend, or rewrite within their track.
