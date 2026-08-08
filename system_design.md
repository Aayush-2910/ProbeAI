# ProbeAI — System Design Brief for the Backend Developer

**Audience:** whoever is building or rebuilding the backend for this project.
**Status:** derived entirely from the shipped frontend — every claim below is backed by a file/line
reference, not a guess about what the backend "should" do.

---

## 1. How to read this document

This is a **requirements spec, not an architecture spec.** It tells you what the system must do and
exactly what the frontend already expects, because that part is not negotiable — the frontend is
built and calls specific endpoints with specific payloads. Everything else — language, framework,
database, hosting, how the AI logic is actually implemented — is yours to decide. Where the frontend
genuinely doesn't care, this document says so explicitly.

**A reference backend already exists in this repo** (`backend/`, documented in `ARCHITECTURE.md`) —
Python/FastAPI/Gemini, in-memory sessions, no database. You are free to use it, diverge from it, or
ignore it entirely and build something else in another stack. This document does not assume you will
read that code; it derives every requirement fresh from the frontend instead, so it stands on its own.

---

## 2. What this product is

ProbeAI conducts AI-driven technical interviews for graduates of a 31-day AI Engineering cohort. A
recruiter or reviewer picks a candidate profile, the system interviews them — adaptive follow-up
questions, difficulty matched to their experience, calibrated to what they actually struggled with in
the cohort — and ends with a structured, specific assessment (strengths, gaps, next steps).

It is explicitly **not** a static quiz. The defining behaviors the backend must support:

- The interview is **personalized before the first question** — the opening question already reflects
  the candidate's background.
- Weak or vague answers get a **follow-up on the same topic**, not a move to the next question.
- The interview **ends itself** after a reasonable amount of ground has been covered — the frontend
  never decides this; it just renders whatever the backend sends back.
- The closing feedback **references specific things the candidate said**, not generic praise.

How the backend decides all this (deterministic logic, an LLM, a hybrid, prompt engineering, rules) is
entirely an implementation choice. The frontend only sees the *outcome* of that decision, never the
mechanism, through the contract in §4.

---

## 3. The frontend, and the flow the backend has to serve

The app is a single-page React app with **two views**, switched by one boolean
(`isInterviewing = Boolean(sessionId)` — `frontend/src/App.jsx:33`). There is no router. The backend
does not need to know about "pages" — it needs to support the sequence of calls below.

### 3.1 Landing view — candidate selection

- On load, the frontend fetches the full candidate roster and renders it as a browsable list with a
  preview panel (`frontend/src/hooks/useCandidates.js`, `CandidateDetail.jsx`).
- The preview panel is built **entirely from fields already present on the candidate object** — see
  §4.3. It does not make a second request per candidate.
- The user picks one candidate and clicks "Start Interview." That's the only input this view produces.

### 3.2 Interview view — the conversation

- The moment "Start" is clicked, the frontend generates its own session ID client-side (a UUID) and
  immediately switches to the chat view with a loading/typing state — it does not wait for the backend
  to hand back an ID (`useInterview.js:57-85`). **The backend must accept a client-generated session ID
  on the first call**, not issue its own.
- Every subsequent turn: the user's answer appears in the chat immediately (optimistic UI), a typing
  indicator shows, and the backend's reply is appended when it arrives (`useInterview.js:121-132`).
- The frontend tracks progress **client-side, from what the backend has already sent** — it counts
  interviewer messages to show "Question 4 of ~10" and derives elapsed time from when the session
  started (`StatsBar.jsx`, `InterviewView.jsx:23-24`). **The backend does not need a separate
  "progress" endpoint** — the reply stream is the only signal the frontend uses.
- The interview ends when a reply arrives with `done: true`. The frontend then renders the feedback
  card and unmounts the input entirely (`InterviewView.jsx:76-80`) — there is no way to send another
  message to a finished session from the UI.
- "Start New Interview" resets all client state and returns to the landing view. It does **not** call
  any "end/delete session" endpoint — if the backend needs cleanup, it has to do it on its own (e.g. a
  TTL), because the frontend will never tell it the user walked away.

### 3.3 What "adaptive" means operationally

Two frontend behaviors are load-bearing for how you design the interview logic, whatever you build it
in:

1. **A follow-up and a new question look identical to the frontend.** Both are just "the next reply
   in the transcript." The frontend does not send a flag saying "ask a follow-up here" — the backend
   has to decide, on every turn, whether the last answer earned a deeper question or the interview
   should move on. This has to be entirely a backend-side decision per turn.
2. **The frontend does not know the interview plan, topic list, or scoring at any point.** It never
   receives and never displays anything like "next topic: prompt engineering." Whatever internal plan
   or state you use to decide questions, none of it should leak into `reply` text or any other field —
   the candidate-facing text is the only thing the frontend renders.

---

## 4. The API contract the frontend already calls

This is not proposed — it's implemented. `frontend/src/utils/api.js` is the **only** file that talks to
a backend, and it calls exactly these two endpoints. If you build something that doesn't match this
shape, the frontend needs code changes too — flag that early rather than silently diverging.

Base path: `/api`. All three request forms hit the same two routes.

### 4.1 `GET /api/candidates`

Returns an array of candidate objects (shape in §4.3). Called once, on landing-view mount
(`useCandidates.js`). No pagination, no query params are sent by the frontend today.

### 4.2 `POST /api/interview` — one endpoint, three request shapes

| Frontend call | Request body | What the frontend does with the response |
|---|---|---|
| Start | `{ sessionId, candidate }` — `candidate` is the **exact object** `GET /api/candidates` returned for the selected profile, unmodified (`api.js:107`) | Renders `response.reply` as the first interviewer message |
| Turn | `{ sessionId, message }` — the candidate's typed answer, trimmed, non-empty | Appends `response.reply`; if `response.done` is truthy, also reads `response.feedback` and locks the chat |
| (End is not a separate call) | — | The end state is just a turn response where `done: true` |

**Response shape the frontend reads, every call:**

```jsonc
{
  "reply": "string — the only thing rendered as an interviewer message",
  "done": false,                 // boolean. Optional/falsy = interview continues
  "feedback": {                  // ONLY read when done === true; ignored otherwise
    "summary": "string",
    "strengths": ["string", ...],
    "gaps": ["string", ...],
    "next": ["string", ...]
  }
}
```

Nothing else in the response body is read by the frontend today. You may add fields freely (e.g. for
future debugging/analytics) without breaking anything, as long as `reply` and `done` (and `feedback`
when `done` is true) are present with these types.

### 4.3 The candidate object shape

This is what `GET /api/candidates` must return per item, and what gets sent back verbatim as the
`candidate` field when starting an interview. Every field below is actually read somewhere in the UI
(`helpers.js`, `CandidateDetail.jsx`) — this isn't a guess at a schema, it's reverse-engineered from
real usage:

```jsonc
{
  "member": {
    "id": "string",              // used as the React key / selection id
    "name": "string",
    "jobRole": "string",
    "yearsExperience": 0,        // number
    "education": "string"        // optional — only rendered if present
  },
  "missions": [
    {
      "day": 1,                  // number — used to look up a title from curriculum data
      "title": "string",         // optional fallback if day lookup fails
      "passed": true,            // boolean or absent
      "attempts": 1,             // number, defaults to 1 if absent
      "skipped": false           // boolean
    }
  ],
  "signals": {
    "commitDays": 0,             // optional — shown as "engaged X days"; omitted if absent
    "missionsCompleted": 0,      // optional — falls back to counting passed missions
    "missionsFirstTry": 0        // optional — falls back to counting attempts===1 passes
  }
}
```

The frontend derives, entirely client-side, from this data: a completion percentage, a "first try"
count, a four-way breakdown (mastered / struggled / failed / skipped, using `attempts >= 3` as the
"struggled" cutoff), and up to 3 "notable gap" topic names (skipped-or-failed missions, titled via a
lookup keyed by `day`). **None of that derived data needs to come from the backend** — sending the raw
`missions`/`signals` arrays is sufficient; the frontend does the rest.

If you need a source of curriculum day titles for your own backend logic, one already exists in this
repo at `backend/data/curriculum.json` (31 entries, `{day, title, module, objectives, tools}`) — reuse
it or replace it, the frontend only needs the candidate object above, not curriculum data directly
(it reads a local copy for display purposes only).

### 4.4 Errors — the frontend already distinguishes these cases

`api.js` maps HTTP status codes to distinct user-facing behaviors. Your backend should return these
specific codes so the right thing happens on screen, rather than a generic 500 for everything:

| Status | Frontend behavior | When to send it |
|---|---|---|
| `404` | "This session expired, start a new interview" (terminal — no retry offered) | `sessionId` from a Turn call is unknown to the backend |
| `409` | Silently resyncs to "interview already done" state | A Turn call arrives for a session that's already finished |
| `503` | "Interviewer unavailable, retry" (the failed message stays on screen with a Retry button) | Your interview-generation logic (LLM or otherwise) fails transiently |
| `400` / `422` | Generic "something went wrong" | Malformed request body |
| anything else / network failure | "Could not reach the server" | — |

A JSON body with a `detail` string field is read and shown to the user when present
(`api.js:57-66`) — a plain string like `{"detail": "Session not found"}` is the most useful thing you
can return alongside a 404/503.

**Timeout expectation:** the frontend allows **90 seconds** per call before giving up (`api.js:34`).
Whatever generates the interview reply is expected to be slow (seconds, not milliseconds) — design
for that; don't assume sub-second responses are required.

---

## 5. Non-functional requirements implied by the frontend

- **Session continuity across requests.** The frontend calls the backend multiple times per interview,
  each carrying the same `sessionId` it generated at start. Whatever you use for state (in-memory, a
  database, a cache) must be keyed by that client-supplied ID and survive between calls, for as long as
  the interview is realistically active. There is no explicit session-close signal from the client —
  design your own expiry/cleanup policy.
- **No authentication is implemented or assumed by the frontend.** It sends no auth headers, no
  cookies-as-identity. If you add auth, it's an addition on top of this contract, not a replacement for
  any part of it.
- **CORS:** the frontend can run on a different origin than the backend in development (Vite dev server
  proxies `/api`, but a deployed frontend calling a separately-hosted backend needs CORS enabled).
- **Idempotency isn't required by the client**, but is good practice: the frontend's own retry logic
  resends the exact same `message` after a failure, so a backend that treats identical resends as new
  turns could double-count an answer. Consider whether you want to guard against that server-side.
- **Statelessness of the frontend:** every piece of interview state the UI displays (question count,
  elapsed time, transcript) is derived from responses already received and local timestamps — the
  frontend never asks the backend "what's the state of this session?" It only ever sends the next
  message and reads the next reply. Design your API surface knowing the client will never poll or
  re-fetch state mid-interview.

---

## 6. What's genuinely open for you to decide

Nothing above prescribes *how* the interview logic works, only what goes in and what must come out.
You choose:

- **Language/framework** — the frontend only cares that `/api/candidates` and `/api/interview` exist
  and return the shapes in §4. It has zero dependency on Python, FastAPI, or anything else.
- **How interview questions are generated** — LLM-based, rule-based, a hybrid, whatever produces good
  `reply` text and a sound `done` decision.
- **How difficulty/personalization is computed** from the candidate object — the frontend hands you the
  full profile and does not care how you use it.
- **Database vs. in-memory vs. cache** for session storage — pick based on your deployment target and
  how long sessions realistically need to live.
- **Where candidate data lives** — a database, a file, a third-party system — as long as
  `GET /api/candidates` returns the shape in §4.3.
- **Deployment/hosting** — the frontend is a static build (`frontend/dist`) that can be served by the
  backend itself, a CDN, or anything else that can also reach `/api/*`.

---

## 7. Fastest way to verify your backend against this contract

The frontend already has a **mock implementation** of this exact contract
(`frontend/src/mocks/mockApi.js`) that the whole UI runs against with zero backend involvement — it's
the reference implementation of "what does a correct response look like at each step." Reading it is a
faster way to see the expected turn-by-turn behavior than reading this document a second time.

To point the real frontend at your backend once it exists: set `VITE_API_MODE=live` in
`frontend/.env` and run `npm run dev` — no frontend code changes required if your API matches §4.
