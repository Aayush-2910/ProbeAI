/**
 * CandidateSelector — dropdown + start button.
 * FRONTEND-ARCHITECTURE.md §6
 */

import { useState } from 'react'

import { useCandidates } from '../hooks/useCandidates'
import { formatCandidateLabel } from '../utils/helpers'

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-4 top-1/2 h-4 w-4
      -translate-y-1/2 text-text-muted" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export default function CandidateSelector({ onStart, isStarting }) {
  const { candidates, status, retry } = useCandidates()
  const [selectedId, setSelectedId] = useState('')

  const selected = candidates.find((c) => c.member?.id === selectedId) ?? null
  const canStart = Boolean(selected) && !isStarting

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface px-6 py-5">
        <p className="text-[15px] text-text-muted">Could not load candidates.</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-lg border border-border px-4 py-2 text-[14px] font-medium text-text
                     transition-colors hover:bg-wash focus:outline-none focus-visible:ring-2
                     focus-visible:ring-input-focus"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative">
        <label htmlFor="candidate" className="sr-only">
          Candidate
        </label>
        <select
          id="candidate"
          value={selectedId}
          disabled={status === 'loading' || isStarting}
          onChange={(event) => setSelectedId(event.target.value)}
          className="w-full appearance-none rounded-xl border border-input-border bg-input-bg px-4 py-3
                     pr-11 text-[15px] text-text transition-colors focus:border-input-focus
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-input-focus
                     disabled:opacity-60"
        >
          <option value="">
            {status === 'loading' ? 'Loading candidates…' : 'Choose a candidate…'}
          </option>
          {candidates.map((candidate) => (
            <option key={candidate.member.id} value={candidate.member.id}>
              {formatCandidateLabel(candidate)}
            </option>
          ))}
        </select>
        <ChevronIcon />
      </div>

      <button
        type="button"
        disabled={!canStart}
        // onStart receives the full candidate object, unmodified — the backend
        // expects member/missions/signals exactly as served. §6
        onClick={() => selected && onStart(selected)}
        className="flex items-center justify-center gap-2 rounded-xl bg-btn-bg px-5 py-3 text-[15px]
                   font-semibold text-btn-text transition-colors hover:bg-btn-hover
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-input-focus
                   focus-visible:ring-offset-2 focus-visible:ring-offset-bg
                   disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-btn-bg"
      >
        {isStarting ? (
          <>
            <Spinner />
            Starting…
          </>
        ) : (
          'Start Interview'
        )}
      </button>
    </div>
  )
}
