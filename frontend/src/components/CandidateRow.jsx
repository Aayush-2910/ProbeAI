/**
 * CandidateRow — one compact row in the candidate list panel.
 */

import { candidateStats, initials } from '../utils/helpers'

export default function CandidateRow({ candidate, isSelected, onSelect }) {
  const { name, role, completed, completionPct } = candidateStats(candidate)

  return (
    <button
      type="button"
      onClick={() => onSelect(candidate)}
      role="option"
      aria-selected={isSelected}
      className={`glow-hover w-full border-l-[3px] px-4 py-3.5 text-left transition-all duration-150
        ${
          isSelected
            ? 'border-accent-strong bg-elevated'
            : 'border-transparent hover:border-accent-muted hover:bg-hover'
        }
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted focus-visible:ring-inset`}
    >
      {/* relative: paints above the glow-hover ::before (absolutely
          positioned, would otherwise cover this static content). */}
      <span className="relative flex w-full items-center gap-3.5">
        <span
          aria-hidden="true"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-[12.5px]
                      font-bold transition-colors
                      ${
                        isSelected
                          ? 'border-btn-bg bg-btn-bg text-btn-text'
                          : 'border-border bg-elevated text-accent-strong'
                      }`}
        >
          {initials(name)}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-semibold leading-tight text-text">
            {name}
          </span>
          <span className="block truncate text-[13px] font-normal leading-tight text-text-secondary">
            {role}
          </span>
        </span>

        <span className="shrink-0 text-right font-mono text-[12px] font-semibold tabular-nums text-text-muted">
          {completed}/31
          <span className="mt-1.5 block h-1 w-10 overflow-hidden rounded-full bg-track">
            <span
              className="block h-full rounded-full bg-accent-muted"
              style={{ width: `${completionPct}%` }}
            />
          </span>
        </span>
      </span>
    </button>
  )
}
