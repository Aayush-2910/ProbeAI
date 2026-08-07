/**
 * useCandidates — loads the candidate roster for the landing page.
 * FRONTEND-ARCHITECTURE.md §6
 *
 * Called INSIDE CandidateSelector: state logic lives in a hook (project rule 7)
 * while re-renders stay local to the component that owns the dropdown.
 */

import { useCallback, useEffect, useState } from 'react'

import { fetchCandidates } from '../utils/api'

export function useCandidates() {
  const [candidates, setCandidates] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'error' | 'ready'
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // StrictMode double-invokes effects in dev; `active` keeps the second run
    // from writing stale results.
    let active = true
    setStatus('loading')

    fetchCandidates()
      .then((data) => {
        if (!active) return
        setCandidates(Array.isArray(data) ? data : [])
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })

    return () => {
      active = false
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { candidates, status, retry }
}
