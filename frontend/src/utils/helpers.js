/**
 * Pure helpers. No React, no fetch, no module state.
 * FRONTEND-ARCHITECTURE.md §6
 *
 * Curriculum titles are read from the real data file (never hardcoded) so the
 * candidate-detail preview always matches backend/data/curriculum.json.
 */

import curriculumData from '../../../backend/data/curriculum.json'

const DAY_TITLE = new Map(curriculumData.days.map((d) => [d.day, d.title]))

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

/** Length of the cohort — the denominator every completion stat is out of. */
export const COHORT_DAYS = 31

/** Everything a candidate card renders, derived from the profile as served. */
export function candidateStats(candidate) {
  const member = candidate?.member ?? {}
  const signals = candidate?.signals ?? {}

  const missions = candidate?.missions ?? []
  const completed =
    signals.missionsCompleted ?? missions.filter((m) => m.passed === true).length
  const firstTry =
    signals.missionsFirstTry ??
    missions.filter((m) => m.passed === true && (m.attempts ?? 1) === 1).length

  return {
    id: member.id,
    name: member.name ?? 'Candidate',
    role: member.jobRole ?? 'Unknown role',
    years: years(member.yearsExperience) + ' experience',
    completed,
    firstTry,
    completionPct: Math.round((Math.min(completed, COHORT_DAYS) / COHORT_DAYS) * 100),
  }
}

/** "SJ" from "Sarah Johnson" — for the row/detail avatar. */
export function initials(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

/**
 * A quick, purely presentational read on mission outcomes — four buckets for
 * the detail-panel breakdown. This is NOT the interview planner's priority
 * logic (that lives in the backend / mockApi); it exists only to give a
 * glance-able preview before the interview starts, so its thresholds are
 * simpler on purpose.
 */
export function missionBreakdown(candidate) {
  const missions = candidate?.missions ?? []
  let mastered = 0
  let struggled = 0
  let failed = 0
  let skipped = 0

  for (const mission of missions) {
    if (mission.skipped) skipped += 1
    else if (mission.passed === false) failed += 1
    else if ((mission.attempts ?? 1) >= 3) struggled += 1
    else mastered += 1
  }

  return { mastered, struggled, failed, skipped, total: missions.length }
}

/** Up to `limit` topics the candidate skipped or failed, titled from curriculum.json. */
export function notableGaps(candidate, limit = 3) {
  const missions = candidate?.missions ?? []
  const titleOf = (m) => DAY_TITLE.get(m.day) ?? m.title ?? `Day ${m.day}`
  const skipped = missions.filter((m) => m.skipped).map(titleOf)
  const failed = missions.filter((m) => m.passed === false).map(titleOf)
  return [...skipped, ...failed].slice(0, limit)
}
