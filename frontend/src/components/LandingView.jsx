/**
 * LandingView — hero, compact candidate workspace, and two trust sections
 * (How It Works, AI Performance) for first-time visitors.
 */

import CandidateSelector from './CandidateSelector'
import Footer from './Footer'
import HeroRobot from './HeroRobot'
import HowItWorks from './HowItWorks'
import PerformanceStats from './PerformanceStats'

const FACTS = ['20 Candidates', '31-Day Curriculum', '8 Modules', 'AI-Powered Assessment']

export default function LandingView({ onStart, isLoading, error, onDismissError }) {
  return (
    <div className="view-enter chat-scrollbar scroll-smooth flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-shell flex-col items-center px-6 py-10 sm:px-8 sm:py-12 xl:py-16">
        {/* Hero: text left, robot + floating cards right. Stacks (robot below
            text) below lg — there isn't room to run them side by side before
            that, and a squeezed robot image reads worse than a stacked one. */}
        {/* Not flex-1 on the text column: it used to claim all leftover row
            width even though the paragraph is capped at max-w-xl, leaving
            500px+ of INVISIBLE trailing space inside the text column before
            the image even started — the real cause of "too far apart", not
            the gap value. Left unjustified (not centered) so the pair stays
            anchored to the row's left edge rather than floating to the
            middle of a now-wide shell. */}
        <div className="flex w-full flex-col items-center gap-6 lg:flex-row lg:items-center lg:gap-10
                        lg:pl-6 xl:gap-14 xl:pl-10">
          <div className="flex w-full flex-col items-center text-center lg:w-auto lg:max-w-xl
                          lg:items-start lg:text-left xl:max-w-2xl">
            <h1 className="font-logo text-[32px] font-bold uppercase leading-none tracking-[0.26em]
                           text-logo text-glow sm:text-[42px] xl:text-[52px]">
              ProbeAI
            </h1>
            <p className="mt-3.5 text-[16px] font-medium tracking-wide text-text-secondary xl:text-[18px]">
              An AI That Doesn&apos;t Just Ask. It Probes.
            </p>

            <p className="mx-auto mt-3.5 max-w-lg text-center text-[15.5px] font-normal leading-relaxed
                          text-text-secondary lg:mx-0 lg:text-left xl:max-w-xl xl:text-[17px]">
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
                            text-[11.5px] font-semibold uppercase tracking-[0.07em] text-text-secondary
                            lg:justify-start xl:text-[12.5px]">
              {FACTS.map((fact, index) => (
                <span key={fact} className="flex items-center gap-3">
                  {index > 0 && <span className="text-border" aria-hidden="true">|</span>}
                  {fact}
                </span>
              ))}
            </div>
          </div>

          <HeroRobot />
        </div>

        <div className="my-8 h-px w-full max-w-lg accent-line lg:my-12" />

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
