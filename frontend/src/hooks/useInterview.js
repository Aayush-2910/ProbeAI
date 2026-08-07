/**
 * useInterview — THE BRAIN. Single source of truth for the interview.
 * Track C · FRONTEND-ARCHITECTURE.md §4, §5, §6
 *
 * Instantiated exactly ONCE, in App. Everything else gets props.
 *
 * State:
 *   sessionId          string | null
 *   selectedCandidate  object | null
 *   messages           Array<{ id, role: 'interviewer'|'candidate', content,
 *                              timestamp, status?: 'sent'|'failed' }>
 *   isLoading          boolean   // true while any request is in flight
 *   isDone             boolean   // backend returned done: true
 *   feedback           object | null
 *   error              { message, kind } | null
 *
 * Returns:
 *   { sessionId, selectedCandidate, messages, isLoading, isDone, feedback, error,
 *     startInterview, sendMessage, retryLast, resetInterview, dismissError }
 *
 * startInterview(candidate):
 *   1. sessionId = createSessionId(); selectedCandidate = candidate; isLoading = true
 *   2. api.startInterview(sessionId, candidate)   // candidate passed VERBATIM
 *   3. push { role: 'interviewer', content: reply }; isLoading = false
 *   on error: clear sessionId (stay on landing), set error
 *
 * sendMessage(text):
 *   1. push { role: 'candidate', content: text } optimistically
 *   2. isLoading = true
 *   3. api.sendMessage(sessionId, text)
 *   4. push interviewer reply; if res.done → isDone = true, feedback = res.feedback
 *   5. isLoading = false
 *   on error: mark THAT message status:'failed', set error, keep the text
 *
 * retryLast():
 *   re-send the last failed message reusing its text and its existing bubble.
 *   Must NOT append a second candidate message.
 *
 * resetInterview():
 *   every field back to initial. The server session is in-memory and abandonable.
 *
 * Guards (§6):
 *   - ignore sendMessage while isLoading or isDone
 *   - ignore startInterview when a session already exists
 *
 * Error mapping: §7 — 404 means the session expired (backend restart) and must
 * offer a fresh start; 409 means state desync, so force isDone = true.
 *
 * Done when: a rapid double-submit fires exactly one request, and
 * fail → retry leaves exactly one candidate bubble.
 *
 * TODO(track-c): implement.
 */
