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

/**
 * In dev this stays '/api' and Vite proxies it to localhost:8000, so no
 * environment switching lives in the app code (FRONTEND-ARCHITECTURE.md §11).
 *
 * In production the frontend is on Vercel and the API is on Render — different
 * origins — so VITE_API_URL points at the backend, e.g.
 *     VITE_API_URL=https://probeai-api.onrender.com
 * Set it in the Vercel project's environment variables. Leaving it unset keeps
 * the relative path, which is what you want if you proxy instead via a
 * vercel.json rewrite.
 */
const API_BASE = `${(import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '')}/api`

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

/* ---------------------------------------------------------------------------
 * VOICE
 *
 * Separate endpoints from /interview on purpose — the interview contract is
 * fixed at { reply, done, feedback } and must not carry audio. The mic flow is
 * composed client-side:
 *     record -> transcribeAudio() -> sendMessage() -> speakText(reply)
 *
 * These have no mock implementation: speech needs a real ElevenLabs key, so in
 * mock mode voice reports itself unavailable and the UI hides the microphone
 * rather than offering a control that cannot work.
 * ------------------------------------------------------------------------- */

const VOICE_UNAVAILABLE = { voice_enabled: false, voice_configured: false }

export async function fetchVoiceStatus() {
  if (useMock()) return VOICE_UNAVAILABLE
  try {
    return await request('/voice/status')
  } catch {
    // Never let a voice probe break the interview UI; text still works.
    return VOICE_UNAVAILABLE
  }
}

/** Upload a recorded Blob and get the transcript back. */
export async function transcribeAudio(blob, filename = 'answer.webm') {
  if (useMock()) throw new ApiError('Voice needs the live backend.', 0, 'unknown')

  const form = new FormData()
  form.append('file', blob, filename)
  form.append('language_code', 'eng')

  // Note: no Content-Type header — the browser must set the multipart boundary.
  return request('/voice/transcribe', { method: 'POST', body: form })
}

/**
 * Synthesise speech. Returns an object URL the caller must revoke when done,
 * otherwise every spoken question leaks a blob for the life of the page.
 */
export async function speakText(text, voiceId) {
  if (useMock()) throw new ApiError('Voice needs the live backend.', 0, 'unknown')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${API_BASE}/voice/speak`, {
      ...postJson({ text, voice_id: voiceId }),
      signal: controller.signal,
    })
    if (!res.ok) {
      throw new ApiError(await readDetail(res), res.status, classify(res.status))
    }
    return URL.createObjectURL(await res.blob())
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error.name === 'AbortError') throw new ApiError('Speech timed out.', 0, 'network')
    throw new ApiError('Could not reach the speech service.', 0, 'network')
  } finally {
    clearTimeout(timer)
  }
}
