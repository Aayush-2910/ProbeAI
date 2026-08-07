/**
 * The only module that talks to the backend.
 * FRONTEND-ARCHITECTURE.md §7 · backend contract: ARCHITECTURE.md §3
 *
 * Stateless: no module-level mutable state, only network calls.
 */

const API_BASE = '/api'

// Turns are LLM-bound and routinely take 5-20s. A short timeout fires
// mid-answer and looks like a bug, so this is deliberately generous. §7
const TIMEOUT_MS = 90000

export class ApiError extends Error {
  constructor(message, status, kind) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.kind = kind
  }
}

function classify(status) {
  if (status === 404) return 'session-expired'
  if (status === 409) return 'already-done'
  if (status === 503) return 'llm-unavailable'
  if (status === 400 || status === 422) return 'bad-request'
  return 'unknown'
}

async function readDetail(res) {
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
    if (Array.isArray(body?.detail)) return 'The request was rejected by the server.'
  } catch {
    /* non-JSON error body */
  }
  return `Request failed (${res.status}).`
}

async function request(path, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal })
    if (!res.ok) {
      throw new ApiError(await readDetail(res), res.status, classify(res.status))
    }
    return await res.json()
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error.name === 'AbortError') {
      throw new ApiError('The request timed out.', 0, 'network')
    }
    throw new ApiError('Could not reach the server.', 0, 'network')
  } finally {
    clearTimeout(timer)
  }
}

function postJson(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function fetchCandidates() {
  return request('/candidates')
}

/** `candidate` is sent verbatim as served by /api/candidates. Never reshape it. */
export function startInterview(sessionId, candidate) {
  return request('/interview', postJson({ sessionId, candidate }))
}

export function sendMessage(sessionId, message) {
  return request('/interview', postJson({ sessionId, message }))
}
