/**
 * The only module that talks to the backend.
 * FRONTEND-ARCHITECTURE.md §7 · backend contract: ARCHITECTURE.md §3
 *
 * Stateless: no module-level mutable state, only network calls.
 *
 * MODE SWITCH
 * -----------
 * 'mock' (default) runs the whole UI on bundled sample data with no server at
 * all — see src/mocks/mockApi.js. 'live' calls the real API.
 *
 * Set it in frontend/.env:        VITE_API_MODE=live
 * or flip it at runtime from the browser console, no rebuild needed:
 *                                 __PROBEAI_API_MODE__ = 'live'
 *
 * Everything below the switch is the real integration and is untouched by mock
 * mode, so wiring the backend later is a one-line change.
 */

import * as mockApi from '../mocks/mockApi'

const API_BASE = '/api'

export function getApiMode() {
  return globalThis.__PROBEAI_API_MODE__ ?? import.meta.env?.VITE_API_MODE ?? 'mock'
}

function useMock() {
  return getApiMode() !== 'live'
}

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
  // 500/502/504 in dev almost always means the API is down and the Vite proxy
  // is answering on its behalf — that is a reachability problem, not a bug in
  // the request. Treat it as network so the UI says something actionable.
  if (status === 500 || status === 502 || status === 504) return 'network'
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
    throw new ApiError(
      'Could not reach the server. Check that the backend is running on port 8000.',
      0,
      'network',
    )
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
  if (useMock()) return mockApi.fetchCandidates()
  return request('/candidates')
}

/** `candidate` is sent verbatim as served by /api/candidates. Never reshape it. */
export function startInterview(sessionId, candidate) {
  if (useMock()) return mockApi.startInterview(sessionId, candidate)
  return request('/interview', postJson({ sessionId, candidate }))
}

export function sendMessage(sessionId, message) {
  if (useMock()) return mockApi.sendMessage(sessionId, message)
  return request('/interview', postJson({ sessionId, message }))
}
