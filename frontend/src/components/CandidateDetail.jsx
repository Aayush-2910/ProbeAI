/**
 * CandidateDetail — right panel: selected candidate's preview + Start control.
 *
 * The "preview" here is factual profile data (mission counts, engagement,
 * named gaps) — never a claim about what the AI will actually ask. The real
 * interview plan is decided server-side once the interview starts.
 */

import { candidateStats, initials, missionBreakdown, notableGaps } from '../utils/helpers'

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] animate-spin" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function EmptyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 text-text-muted" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 20c0-3.4 3.1-6 7-6s7 2.6 7 6" />
    </svg>
  )
}

function StatChip({ label, value }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-2.5 py-3 text-center sm:px-4 sm:py-3.5">
      <div className="break-words font-mono text-[16px] font-bold tabular-nums text-text sm:text-[19px]">
        {value}
      </div>
      {/* break-words: a single-word label (e.g. "Completed") has no space to
          wrap at — without it, a narrow chip on a 320px screen overflows
          instead of shrinking. */}
      <div className="mt-1 break-words text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-muted sm:text-[11.5px]">
        {label}
      </div>
    </div>
  )
}

function BreakdownDot({ tone }) {
  const color = {
    mastered: 'bg-accent-strong',
    struggled: 'bg-warn',
    failed: 'bg-danger',
    skipped: 'bg-text-muted',
  }[tone]
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />
}

export default function CandidateDetail({ candidate, isStarting, onStart }) {
  if (!candidate) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-14 text-center
                      md:min-h-[540px]">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface">
          <EmptyIcon />
        </span>
        <p className="max-w-[280px] text-[14.5px] font-normal leading-relaxed text-text-secondary">
          Select a candidate to preview their cohort record and start the interview.
        </p>
      </div>
    )
  }

  const { name, role, years, completed, firstTry } = candidateStats(candidate)
  const breakdown = missionBreakdown(candidate)
  const gaps = notableGaps(candidate, 3)
  const commitDays = candidate.signals?.commitDays
  const education = candidate.member?.education

  return (
    <div className="flex flex-1 flex-col p-5 sm:p-6 md:min-h-[540px] md:p-8 xl:min-h-[600px] xl:p-10">
      {/* Capped so the wide flex-1 panel becomes breathing room around a
          well-proportioned content column, not three stat chips stretched
          to 400px each with a lonely number in the middle of each one. */}
      <div className="flex w-full max-w-[640px] flex-col xl:max-w-[720px]">
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border
                     border-accent-muted bg-elevated text-[17px] font-bold text-accent-strong
                     xl:h-20 xl:w-20 xl:text-[20px]"
        >
          {initials(name)}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-[22px] font-bold leading-tight text-text xl:text-[26px]">{name}</h3>
          <p className="mt-0.5 truncate text-[14.5px] font-medium leading-tight text-text-secondary">
            {role} · {years}
          </p>
        </div>
      </div>

      {education && (
        <p className="mt-2.5 text-[13px] font-normal text-text-muted">{education}</p>
      )}

      <div className="mt-6 flex gap-2 sm:gap-3">
        <StatChip label="Completed" value={`${completed}/31`} />
        <StatChip label="First Try" value={`${firstTry}/31`} />
        <StatChip label="Engaged" value={commitDays != null ? `${commitDays}d` : '—'} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border
                      border-border bg-surface px-4 py-3.5">
        <span className="flex items-center gap-2 text-[13px] font-medium text-text-secondary">
          <BreakdownDot tone="mastered" />
          {breakdown.mastered} mastered
        </span>
        <span className="flex items-center gap-2 text-[13px] font-medium text-text-secondary">
          <BreakdownDot tone="struggled" />
          {breakdown.struggled} struggled
        </span>
        <span className="flex items-center gap-2 text-[13px] font-medium text-text-secondary">
          <BreakdownDot tone="failed" />
          {breakdown.failed} failed
        </span>
        <span className="flex items-center gap-2 text-[13px] font-medium text-text-secondary">
          <BreakdownDot tone="skipped" />
          {breakdown.skipped} skipped
        </span>
      </div>

      {gaps.length > 0 && (
        <div className="mt-5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
            Notable Gaps
          </span>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {gaps.map((topic) => (
              <span
                key={topic}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px]
                           font-medium text-text-secondary"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        disabled={isStarting}
        onClick={() => onStart(candidate)}
        className="glow-hover lift mt-auto rounded-xl bg-btn-bg px-7 py-3.5
                   text-[15.5px] font-semibold tracking-wide text-btn-text hover:bg-btn-hover
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted
                   focus-visible:ring-offset-2 focus-visible:ring-offset-surface
                   disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none
                   enabled:glow-accent"
      >
        {/* relative: paints above the glow-hover ::before. */}
        <span className="relative flex items-center justify-center gap-2.5">
          {isStarting ? (
            <>
              <Spinner />
              Initializing Interview…
            </>
          ) : (
            <>
              <PlayIcon />
              Start Interview
            </>
          )}
        </span>
      </button>
      </div>
    </div>
  )
}
