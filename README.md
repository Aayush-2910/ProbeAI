# ProbeAI

**An AI that doesn't just ask. It probes.**

ProbeAI is an AI-powered technical interview agent. It conducts personalized, adaptive, multi-turn
technical interviews for candidates who completed a 31-day AI Engineering Cohort.

It is **not a quiz engine.** It is an interviewer. It listens, adapts, probes deeper on weak answers,
calibrates difficulty to the candidate's experience, and transitions between topics naturally — the
way a senior engineer running a real 1-on-1 would.

---

## What makes it an interviewer

| | |
|---|---|
| **It reads the candidate before it speaks** | Every mission the candidate attempted is mapped to its curriculum day and classified — skipped, failed, struggled, mastered. A skipped observability module is a `CRITICAL` gap; a first-try pass is a topic to verify briefly and go deep on. |
| **It calibrates difficulty** | An intern is never asked about Kubernetes trade-offs. A principal architect is never asked what an embedding is. Role and seniority set the baseline; actual cohort performance adjusts it by one level in either direction. |
| **It follows up** | A vague answer does not advance the interview. The interviewer pushes for a specific example, a number, a decision, or a failure — on the same topic. |
| **It knows when to stop** | 8–12 questions across 4+ curriculum days. The exit is enforced by server-side counters, never by the model's own judgment. |
| **Its feedback cites the interview** | Not "good understanding of AI concepts." Instead: *"Could not articulate when to use fine-tuning versus RAG, defaulting to 'it depends' without naming a single criterion even after a direct follow-up."* |

---

## Architecture at a glance

```
Client ──POST /api/interview──▶ FastAPI
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       ▼                          ▼                          ▼
 interview_planner        conversation_engine        feedback_generator
   THE BRAIN                THE INTERVIEWER            THE ASSESSMENT
 deterministic Python      Gemini · every turn       Gemini · once, at end
 no LLM, auditable         structured JSON out       transcript-grounded
```

**The most important design decision is what is *not* generated.** The interview plan — which
curriculum days to probe, in what order, at what difficulty — is deterministic Python. An LLM asked to
"plan an interview" produces a different plan every run, can't be audited, and can't be unit-tested.
The plan is stable and inspectable; only the *talking* is generative.

The second: **the model never decides its own exit.** `should_end = must_close or (may_close and
model_says_closing)` — model judgment strictly inside hard-coded bounds.

### Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.11 · FastAPI · Uvicorn · Pydantic v2 |
| LLM | Google Gemini (`gemini-2.5-flash`) with structured JSON output |
| Storage | In-memory session dict — no database, no auth by design |
| Frontend | React 18 · Vite · Tailwind (no UI or icon libraries) |

---

## Quickstart

```bash
pip install -r requirements.txt
cp .env.example .env          # add your GEMINI_API_KEY

# see the planner work — no API key needed
python scripts/preview_plan.py            # list all 20 candidates
python scripts/preview_plan.py CAND-001   # full interview plan for one

# run the API
uvicorn main:app --reload --app-dir backend

# take the interview in your terminal
python scripts/interview_cli.py CAND-010
```

`preview_plan.py` is the fastest way to see the non-generative half of the system: it prints the exact
plan any candidate would receive — priorities, signals, objectives, calibrated question stems — with
no LLM involved.

---

## API

Single endpoint, three states. Full contract in [ARCHITECTURE.md §3](ARCHITECTURE.md).

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

Also: `GET /` health check · `GET /api/candidates` returns all 20 sample profiles.

---

## The candidates

20 sample profiles, each internally consistent (signals derived from missions, not hand-typed). The
archetypes are test fixtures, not decoration — each one exercises a different path through the planner:

| Candidate | Archetype | Exercises |
|---|---|---|
| CAND-001 Sarah Johnson | Senior engineer, specific gaps | architecture calibration, one skipped day |
| CAND-003 Emily Chen | Perfect student — 31/31, 30 first try | difficulty step-**up** |
| CAND-004 David Miller | Non-technical fighter (MBA, high attempts) | role-keyword downgrade |
| CAND-010 Gerald Combs | Struggling but persistent — 1 first-try pass | performance step-**down** |
| CAND-011 Mia Alvarez | Heavy skipper — 6 core modules skipped | `CRITICAL`-dominated plan |

Curriculum: 31 days across 8 modules, from environment setup through embeddings, RAG, prompting,
fine-tuning, agents and MCP, evaluation and security, to production and capstone.

---

## Documentation

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Backend contract — module signatures, session schema, planner algorithm, prompt architecture, state machine, work breakdown |
| [FRONTEND-ARCHITECTURE.md](FRONTEND-ARCHITECTURE.md) | Frontend contract — token strategy, state ownership, component props, error taxonomy, motion and accessibility |
| [PROMPTS.md](PROMPTS.md) | How this was built, and the prompts that run inside it — persona, the ten interviewer rules, closing directives, evaluator constraints |

---

## Project status

Stated plainly, because a README that overclaims is worse than one that underclaims.

| Area | State |
|---|---|
| Backend — 9 modules | ✅ implemented, passes the offline suite end to end |
| `curriculum.json` · `candidates.json` | ✅ 31 days, 20 profiles |
| Architecture specs (backend + frontend) | ✅ complete, frozen for implementation |
| Live Gemini run | ⚠️ not yet performed — prompt tuning and per-archetype review are open |
| Frontend | ⚠️ scaffold only — infrastructure filled, all components are contract stubs |
| Static deploy (`frontend/dist` served by FastAPI) | ❌ not wired yet |

Nothing here is claimed to work that has not been run.

---

## Layout

```
backend/          FastAPI app — 9 single-responsibility modules
  data/           curriculum.json (31 days) · candidates.json (20 profiles)
frontend/         React + Vite + Tailwind — scaffold with contract stubs
scripts/          preview_plan.py · interview_cli.py
ARCHITECTURE.md  FRONTEND-ARCHITECTURE.md  PROMPTS.md
```
