/**
 * CandidateSelector — compact two-panel workspace: candidate list (left) +
 * selected candidate's preview and Start control (right).
 */

import { useState } from 'react'

import { useCandidates } from '../hooks/useCandidates'
import CandidateDetail from './CandidateDetail'
import CandidateList from './CandidateList'

export default function CandidateSelector({ onStart, isStarting }) {
  const { candidates, status, errorMessage, retry } = useCandidates()
  const [selectedId, setSelectedId] = useState('')

  const selected = candidates.find((c) => c.member?.id === selectedId) ?? null

  if (status === 'error') {
    return (
      <div
        className="glow-hover flex min-h-[300px] flex-col items-center justify-center rounded-2xl
                  border border-border bg-surface px-6 py-12"
      >
        {/* relative: paints above the glow-hover ::before (absolutely
            positioned, would otherwise cover this static content). */}
        <div className="relative flex flex-col items-center gap-4">
          <p className="text-[16px] font-semibold text-text">Could not load candidates.</p>
          <p className="max-w-sm text-center text-[14px] font-normal leading-relaxed text-text-secondary">
            {errorMessage || 'The server did not respond.'}
          </p>
          <button
            type="button"
            onClick={retry}
            className="glow-hover lift flex min-h-11 items-center rounded-lg border border-border px-5
                       text-[13.5px] font-semibold text-text hover:border-accent-muted focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-accent-muted"
          >
            <span className="relative">Retry</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-border
                    bg-elevated md:flex-row md:divide-x md:divide-border">
      <div className="border-b border-border md:border-b-0">
        <CandidateList
          candidates={candidates}
          status={status}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <CandidateDetail candidate={selected} isStarting={isStarting} onStart={onStart} />
    </div>
  )
}
