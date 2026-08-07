/**
 * LandingView — hero, compact candidate workspace, and two trust sections
 * (How It Works, AI Performance) for first-time visitors.
 */

import CandidateSelector from './CandidateSelector'
import Footer from './Footer'
import HowItWorks from './HowItWorks'
import PerformanceStats from './PerformanceStats'

const FACTS = ['20 Candidates', '31-Day Curriculum', '8 Modules', 'AI-Powered Assessment']

function HeroMark() {
  return (
    <div className="relative flex h-16 w-16 items-center justify-center" aria-hidden="true">
      <span className="halo absolute inset-0 rounded-full border border-accent-muted" />
      <span className="halo halo-delay absolute inset-0 rounded-full border border-accent-muted" />
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full border
                       border-accent-muted bg-surface glow-accent">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-accent-strong" fill="none"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
          <circle cx="12" cy="12" r="7.5" opacity="0.45" />
        </svg>
      </span>
    </div>
  )
}

export default function LandingView({ onStart, isLoading, error, onDismissError }) {
  return (
    <div className="view-enter chat-scrollbar scroll-smooth flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-shell flex-col items-center px-6 py-10 sm:px-8 sm:py-12">
        <HeroMark />

        <h1 className="mt-5 font-logo text-[32px] font-bold uppercase leading-none tracking-[0.26em]
                       text-logo text-glow sm:text-[42px]">
          ProbeAI
        </h1>
        <p className="mt-3.5 text-[16px] font-medium tracking-wide text-text-secondary">
          An AI That Doesn&apos;t Just Ask. It Probes.
        </p>

        <p className="mt-3.5 max-w-lg text-center text-[15.5px] font-normal leading-relaxed text-text-secondary">
          Select a candidate to begin a personalized technical interview based on their AI Cohort
          learning journey.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-5 flex w-full max-w-lg items-center gap-3 rounded-xl border border-border
                       bg-tintDanger py-1 pl-4 pr-1 text-left text-[13px] text-text"
          >
            <span className="flex-1 py-2 font-normal leading-relaxed">{error.message}</span>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss error"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-muted
                         transition-colors hover:text-text focus:outline-none focus-visible:ring-2
                         focus-visible:ring-accent-muted"
            >
              ✕
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5
                        text-[11.5px] font-semibold uppercase tracking-[0.07em] text-text-secondary">
          {FACTS.map((fact, index) => (
            <span key={fact} className="flex items-center gap-3">
              {index > 0 && <span className="text-border" aria-hidden="true">|</span>}
              {fact}
            </span>
          ))}
        </div>

        <div className="my-8 h-px w-full max-w-lg accent-line" />

        <div id="candidates" className="w-full">
          <CandidateSelector onStart={onStart} isStarting={isLoading} />
        </div>

        <div id="how-it-works" className="mt-28 w-full sm:mt-36">
          <HowItWorks />
        </div>

        <div id="performance" className="mt-28 w-full sm:mt-36">
          <PerformanceStats />
        </div>
      </div>

      <div className="mt-24 sm:mt-32">
        <Footer />
      </div>
    </div>
  )
}
