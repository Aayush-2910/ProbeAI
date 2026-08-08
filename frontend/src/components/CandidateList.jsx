/**
 * CandidateList — left panel: header + scrollable row list.
 */

import CandidateRow from './CandidateRow'

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 border-l-[3px] border-transparent px-3 py-2.5">
      <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-elevated" />
      <span className="flex-1 space-y-1.5">
        <span className="block h-3 w-24 animate-pulse rounded bg-elevated" />
        <span className="block h-2.5 w-32 animate-pulse rounded bg-elevated" />
      </span>
    </div>
  )
}

export default function CandidateList({ candidates, status, selectedId, onSelect }) {
  return (
    <div className="flex w-full flex-col md:w-[360px] md:shrink-0 xl:w-[420px]">
      <div className="flex items-center justify-between px-5 pb-2.5 pt-5 xl:px-6 xl:pt-6">
        <span className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-text-secondary">
          Candidates
        </span>
        {status === 'ready' && (
          <span className="font-mono text-[12px] font-medium text-text-muted">
            {candidates.length}
          </span>
        )}
      </div>

      <div
        role="listbox"
        aria-label="Candidates"
        className="chat-scrollbar max-h-[320px] overflow-y-auto px-2.5 pb-3 md:max-h-[540px] xl:max-h-[600px] xl:px-3"
      >
        {status === 'loading'
          ? Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} />)
          : candidates.map((candidate) => (
              <div key={candidate.member.id} className="mb-1 last:mb-0">
                <CandidateRow
                  candidate={candidate}
                  isSelected={candidate.member.id === selectedId}
                  onSelect={(c) => onSelect(c.member.id)}
                />
              </div>
            ))}
      </div>
    </div>
  )
}
