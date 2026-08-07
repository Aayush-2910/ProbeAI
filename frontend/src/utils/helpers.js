/**
 * Pure helpers. No React, no fetch, no module state.
 * FRONTEND-ARCHITECTURE.md §6
 */

function uid(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createSessionId() {
  return uid('session')
}

export function createMessageId() {
  return uid('msg')
}

function years(value) {
  const n = Number(value) || 0
  return `${n} ${n === 1 ? 'year' : 'years'}`
}

/** "Sarah Johnson — Senior Data Engineer (9 years)" — dropdown option label. */
export function formatCandidateLabel(candidate) {
  const m = candidate?.member ?? {}
  return `${m.name ?? 'Unknown'} — ${m.jobRole ?? 'Unknown role'} (${years(m.yearsExperience)})`
}

/**
 * Header pill, split into parts so narrow viewports can drop them in order
 * (years first, then role) instead of wrapping. §14.3
 */
export function candidatePillParts(candidate) {
  const m = candidate?.member ?? {}
  return {
    name: m.name ?? 'Candidate',
    role: m.jobRole ?? '',
    years: `${Number(m.yearsExperience) || 0}y exp`,
  }
}
