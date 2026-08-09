# ProbeAI

**An AI that doesn't just ask. It probes.**

ProbeAI is an AI-powered technical interview agent. It conducts personalized, adaptive, multi-turn
technical interviews for candidates who completed a 31-day AI Engineering Cohort — over text or voice.

It is **not a quiz engine.** It is an interviewer. It listens, adapts, probes deeper on weak answers,
calibrates difficulty to the candidate's experience, and transitions between topics naturally — the
way a senior engineer running a real 1-on-1 would.

---

## What makes it an interviewer

| | |
|---|---|
| **It reads the candidate before it speaks** | Every mission the candidate attempted is mapped to its curriculum day and classified — skipped, failed, struggled, mastered. A skipped module is treated as "no hands-on experience, keep it conceptual"; a first-try pass means it's safe to ask what they actually built. |
| **It calibrates difficulty** | An intern is never asked about Kubernetes trade-offs. A principal architect is never asked what an embedding is. Role and seniority set the baseline; actual cohort performance steps it up or down one level. |
| **It grounds its questions in the real curriculum** | A RAG layer (ChromaDB, 217 curriculum documents + a 192-question bank) retrieves what was actually taught before a question is asked, instead of an LLM guessing at "AI engineering trivia." |
| **It follows up** | A vague answer does not advance the interview. A separate evaluator agent scores every answer before the interviewer decides whether to push for a specific example or move on. |
| **It knows when to stop** | 8–12 questions across 4+ curriculum days. The exit is enforced by server-side counters, never by the model's own judgment. |
| **Its feedback cites the interview** | Not "good understanding of AI concepts." Instead: *"Could not articulate when to use fine-tuning versus RAG, defaulting to 'it depends' without naming a single criterion even after a direct follow-up."* |
| **It never leaks what it knows** | The interviewer holds the candidate's mission history to calibrate difficulty, but is instructed — and code-enforced — never to repeat it back ("you skipped X", "that took you 4 tries"). A regex safety net catches and rewrites anything a live model still slips. |

---

## Try it in 30 seconds — no API key needed

The frontend defaults to **mock mode**: the entire UI — candidate selection, a full adaptive interview,
charts, feedback — runs on bundled sample data with zero network calls.

```bash
cd frontend && npm install && npm run dev
# open http://localhost:5173 — pick a candidate, take the interview
```

Flip `VITE_API_MODE=live` in `frontend/.env` to talk to the actual backend instead (see Quickstart
below). Nothing else about the UI changes — same components, same code path.

---

## Architecture at a glance

Four agents, each with one job, orchestrated by `service.py`. They never call each other directly —
everything passes through the session record, so any agent can be replaced without touching the others.

```
Client ──POST /api/interview──▶ FastAPI
                                   │
        ┌──────────────┬──────────┼──────────┬──────────────┐
        ▼              ▼          ▼          ▼              ▼
   AGENT 1: PLANNER   RAG      AGENT 3:   AGENT 2:      AGENT 4: FEEDBACK
   deterministic   (ChromaDB)  INTERVIEWER EVALUATOR     once, at the end
   Python — runs                 every turn  every turn   transcript-grounded
   once per session               LLM        LLM
```

**The most important design decision is what is *not* generated.** The interview plan — which
curriculum days to probe, in what order, at what difficulty, backed by which authored question — is
deterministic Python (`agents/planner.py`), not an LLM call. An LLM asked to "plan an interview"
produces a different plan every run, can't be audited, and can't be unit-tested. The plan is stable and
inspectable; only the *talking* (the interviewer) and the *judging* (the evaluator, the feedback agent)
are generative.

The second: **the model never decides its own exit.** `should_end = must_close or (may_close and
model_says_closing)` — model judgment strictly inside hard-coded bounds.

The third: **scoring and speaking are separate calls.** The evaluator judges an answer before the
interviewer ever drafts the next question, specifically so the score can't quietly bend to justify the
question the model already wanted to ask.

### Stack

| Layer | Choice |
|---|---|
| Backend | Python · FastAPI · Uvicorn · Pydantic v2 |
| LLM | Groq (`llama-3.3-70b-versatile`, primary) or Google Gemini (`gemini-2.5-flash`) — one env var switches provider, no agent code changes |
| RAG | ChromaDB, two collections (curriculum objectives + question bank), ONNX MiniLM embeddings, keyword-search fallback if the vector store can't build |
| Voice | ElevenLabs — speech-to-text (Scribe) and text-to-speech (Turbo v2.5), turn-based around the same interview pipeline |
| MCP | An MCP 2.0 server (`backend/mcp_server.py`) exposing interview tools/resources to external clients over stdio |
| Storage | In-memory session store by default (Supabase-ready via `SESSION_BACKEND`) — no auth by design |
| Frontend | React 18 · Vite · Tailwind — 20 components, 8 hooks, no UI or icon libraries |
| Charts | Hand-drawn SVG (line/area/bar) — no charting library |
| Deployment | Backend → Render (Docker); Frontend → Vercel (static build) — see [DEPLOY.md](DEPLOY.md) |

---

## Quickstart

```bash
# 1. backend
pip install -r requirements.txt
cp .env.example backend/.env     # add GROQ_API_KEY (or switch LLM_PROVIDER to gemini)

# 2. frontend
cd frontend && npm install && npm run build && cd ..

# 3. run it
uvicorn main:app --reload --app-dir backend
# open http://localhost:8000
```

**Development** (hot reload) — run both, and Vite proxies `/api` to the backend:

```bash
uvicorn main:app --reload --app-dir backend   # terminal 1
cd frontend && npm run dev                    # terminal 2 → http://localhost:5173
```

Set `VITE_API_MODE=live` in `frontend/.env` to point the dev UI at the real backend instead of mock
data. The first backend start downloads a ~79MB embedding model for RAG — set `RAG_ENABLED=false` in
`backend/.env` to skip it and use keyword retrieval while iterating.

Full deploy instructions (Render + Vercel + Docker + MCP) are in [DEPLOY.md](DEPLOY.md).

---

## API

Single endpoint, three states, frozen by the hackathon's [technical-spec.md](technical-spec.md):

**Start** — send the candidate profile:

```jsonc
POST /api/interview
{ "sessionId": "abc-123", "candidate": { "member": {...}, "missions": [...], "signals": {...} } }
→ { "reply": "Welcome + first question...", "done": false }
```

**Turn** — send the answer:

```jsonc
{ "sessionId": "abc-123", "message": "Candidate's answer..." }
→ { "reply": "Follow-up or next question...", "done": false }
```

**End** — server-decided, after 8+ questions across 4+ days:

```jsonc
→ { "reply": "Closing message...", "done": true,
    "feedback": { "summary": "...", "strengths": [...], "gaps": [...], "next": [...] } }
```

Also: `GET /api/candidates` (20 sample profiles) · `GET /` / `GET /api/health` (health + diagnostics —
LLM provider, key presence, RAG backend, voice config) · `POST /api/voice/transcribe`,
`POST /api/voice/speak`, `GET /api/voice/status`, `GET /api/voice/voices` (voice is a separate surface
so the graded contract above never changes shape to carry audio).

---

## The candidates

20 sample profiles, each internally consistent (signals derived from missions, not hand-typed). The
archetypes are test fixtures, not decoration — each one exercises a different path through the planner:

| Candidate | Archetype | Exercises |
|---|---|---|
| CAND-001 Sarah Johnson | Senior engineer, specific gaps | architecture calibration, one skipped day |
| CAND-003 Emily Chen | Fast learner — near-perfect first-try rate | difficulty step-**up** |
| CAND-004 David Miller | Non-technical role (Business Analyst) working a technical cohort | role-based track → conceptual, not implementation, questions |
| CAND-010 Gerald Combs | Struggling but persistent — mostly failed/low first-try | performance step-**down** |
| CAND-011 Mia Alvarez | Non-technical, heavier gaps | `overwhelmed_switcher` archetype, encouraging tone |
| CAND-008 Harold Whitfield | Distinguished Engineer, 28 years | senior track ceiling, `selective_senior` if skips cluster |

Curriculum: 31 days across 8 modules, from environment setup through embeddings, RAG, prompting,
fine-tuning, agents and MCP, evaluation and security, to production and capstone. Backed by a
192-question authored bank (24 per module), each question tagged with what it's safe to assume the
candidate did (`built` / `studied` / `none`).

---

## The frontend

Two pages, one SPA (state-based view switching, no router):

- **Landing** — hero (with a floating-card AI-interview visual), a two-panel candidate workspace
  (scrollable list + selected-candidate preview with a factual profile breakdown), a "How It Works"
  step flow, an "AI Performance" mini-dashboard (animated line/bar/area charts, hand-drawn SVG), and a
  footer.
- **Interview** — a live session bar (agent presence, status, question count, elapsed time, progress),
  the chat transcript with timestamps and a typing indicator, a microphone for voice answers (when the
  backend has ElevenLabs configured), and the answer input. Ends in a feedback card with strengths /
  areas to improve / next steps.
- **Voice Assistant panel** — a Siri-like takeover of the interview surface: a glossy animated orb with
  a rotating scanning ring, sonar pulses while listening, and a waveform that switches between
  listening / thinking / speaking states in real time. On desktop it's a true side panel — the
  transcript column visibly shrinks to make room, it doesn't just overlay on top — and on mobile it
  takes over the full screen, matching how voice assistants behave on a phone. One button (the orb
  itself) starts and stops listening; tapping it while ProbeAI is talking interrupts it (barge-in). All
  of it sits on top of the existing `useVoice` hook — no separate audio pipeline, just a different way
  of visualizing and controlling the same recording/transcription/speech state.

Both dark (default) and light themes are fully tokenized — no hardcoded colors, no `dark:` variants in
components. Responsive from 320px to desktop, with real touch targets (44×44px minimum) throughout.

---

## Documentation

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Original backend contract — module signatures, session schema, planner algorithm, prompt architecture, state machine, work breakdown |
| [FRONTEND-ARCHITECTURE.md](FRONTEND-ARCHITECTURE.md) | Frontend contract — token strategy, state ownership, component props, error taxonomy, motion and accessibility |
| [system_design.md](system_design.md) | Requirements for the backend, derived from the frontend's actual code — what the API had to do before the rebuild filled it in |
| [technical-spec.md](technical-spec.md) | The hackathon-supplied API contract this whole project is graded against |
| [DEPLOY.md](DEPLOY.md) | Deploying to Render (backend) + Vercel (frontend), Docker, MCP server, and what each health-check field means |
| [PROMPTS.md](PROMPTS.md) | How this was built, and the prompts that run inside it — persona, agent prompts, closing directives, evaluator constraints, and every real bug the iteration process caught |

---

## Project status

Stated plainly, because a README that overclaims is worse than one that underclaims.

| Area | State |
|---|---|
| Backend — 4-agent architecture (planner, evaluator, interviewer, feedback) | ✅ implemented |
| RAG (ChromaDB, 217 curriculum docs + 192 questions) | ✅ implemented, keyword fallback verified |
| LLM providers (Groq primary, Gemini fallback) | ✅ implemented; **verified live** against Groq, including the mission-leak and token-cost fixes that only surfaced on a real run |
| Voice (ElevenLabs STT/TTS) | ✅ implemented; **verified live** — round-trip transcription and synthesis both confirmed working |
| MCP server | ✅ implemented (stdio, MCP 2.0) |
| Deployment config (Render + Vercel + Docker) | ✅ backend **deployed and verified live on Render** (health check green, Groq + voice configured); hit and fixed a real free-tier OOM at boot (512MB isn't enough to build the ChromaDB index — RAG_ENABLED defaults to false there, see DEPLOY.md); frontend not yet deployed to Vercel |
| `curriculum.json` · `candidates.json` · `question_bank.json` | ✅ official hackathon data, 31 days / 20 profiles / 192 questions |
| Frontend — 20 components, 8 hooks | ✅ implemented; production build clean; mock mode needs no backend |
| Frontend ↔ live backend integration | ✅ run locally end to end (candidates load, live interview turns, voice) |
| Voice Assistant panel (Siri-like orb UI) | ✅ implemented, built and verified locally; not yet reviewed on a deployed URL |
| Responsive layout, 320px–desktop | ✅ audited component-by-component; see PROMPTS.md for specifics |
| Visual QA in a real browser | ⚠️ verified structurally (contrast math, computed layout) plus manual local runs; not yet reviewed on a deployed URL |

Nothing here is claimed to work that has not been run.

---

## Layout

```
backend/
  agents/         planner (deterministic) · evaluator · interviewer · feedback — 4 agents
  core/           candidates, curriculum, session store, candidate profiling, LLM provider abstraction
  rag/            ChromaDB indexer + vector store (keyword fallback)
  tools/          function-calling tool registry, shared by agent prompts and mcp_server.py
  data/           curriculum.json (31 days) · candidates.json (20 profiles) · question_bank.json (192 Qs)
  voice.py        ElevenLabs STT/TTS
  mcp_server.py   MCP 2.0 server (stdio)
  main.py         FastAPI routes — interview, candidates, health, voice
frontend/         React + Vite + Tailwind
  src/
    components/   20 components — landing page + interview page
    hooks/        8 hooks — all state logic lives here, components are pure UI
    mocks/        mockApi.js — mirrors the real API contract, no backend needed
    utils/        api.js (mock/live switch) · helpers.js (pure formatters)
Dockerfile · render.yaml · frontend/vercel.json    deployment config
ARCHITECTURE.md · FRONTEND-ARCHITECTURE.md · system_design.md · technical-spec.md · DEPLOY.md · PROMPTS.md
```
