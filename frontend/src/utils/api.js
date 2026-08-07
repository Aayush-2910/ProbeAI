/**
 * API layer. The only module that talks to the backend.
 * Track B · FRONTEND-ARCHITECTURE.md §7 · backend contract: ARCHITECTURE.md §3
 *
 * const API_BASE = '/api'   // same origin in prod, Vite proxy in dev
 *
 * Exports:
 *   fetchCandidates()                     -> GET  /api/candidates  -> Candidate[]
 *   startInterview(sessionId, candidate)  -> POST /api/interview   { sessionId, candidate }
 *   sendMessage(sessionId, message)       -> POST /api/interview   { sessionId, message }
 *
 * Response shape: { reply, done, feedback? }  — feedback is ABSENT unless done.
 *
 * Requirements:
 *   - candidate is sent VERBATIM as served by /api/candidates
 *     (member / missions / signals). Never reshape or trim it.
 *   - on !res.ok, parse FastAPI's { detail } and throw an error carrying BOTH
 *     the status and the detail, so the UI can map per §7:
 *       400/422 dev bug · 404 session expired · 409 desync · 503 LLM unavailable
 *   - if an AbortController timeout is added, use >= 60s. Turns are LLM-bound
 *     and a short timeout fires mid-answer and looks like a bug.
 *
 * TODO(track-b): implement.
 */
