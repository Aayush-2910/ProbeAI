/**
 * LandingView — pre-interview screen.
 * FRONTEND-ARCHITECTURE.md §6
 */

import CandidateSelector from './CandidateSelector'

export default function LandingView({ onStart, isLoading, error, onDismissError }) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-10 sm:px-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <h1 className="text-[34px] font-bold uppercase leading-none tracking-[0.3em] text-logo sm:text-[42px]">
          ProbeAI
        </h1>
        <p className="mt-4 text-[15px] text-text-muted">
          An AI That Doesn&apos;t Just Ask. It Probes.
        </p>

        <p className="mt-8 text-[15px] leading-relaxed text-text-muted">
          Select a candidate to begin a personalized technical interview based on their AI Cohort
          learning journey.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-8 flex w-full items-start gap-3 rounded-xl border border-border bg-tintDanger
                       px-4 py-3 text-left text-[14px] text-text"
          >
            <span className="flex-1">{error.message}</span>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss error"
              className="shrink-0 rounded px-1 text-text-muted transition-colors hover:text-text
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-input-focus"
            >
              ✕
            </button>
          </div>
        )}

        <div className="mt-8 w-full">
          <CandidateSelector onStart={onStart} isStarting={isLoading} />
        </div>
      </div>
    </div>
  )
}
