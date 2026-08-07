/**
 * FeedbackCard — the closing assessment.
 */


function Dot({ tone }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
        tone === 'good' ? 'bg-success' : 'bg-warn'
      }`}
    />
  )
}

function Column({ title, items, tone }) {
  // Empty arrays render nothing — no orphaned headers.
  if (!items?.length) return null

  return (
    <section
      className={`flex-1 border-l-[3px] pl-4 ${tone === 'good' ? 'border-success' : 'border-warn'}`}
    >
      <h4 className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.1em] text-text">
        <span className={tone === 'good' ? 'text-success' : 'text-warn'} aria-hidden="true">
          {tone === 'good' ? '✓' : '⚠'}
        </span>
        {title}
      </h4>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2.5 text-[14.5px] font-normal leading-[1.65] text-text">
            <Dot tone={tone} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function FeedbackCard({ feedback, onReset }) {
  if (!feedback) return null

  return (
    <article
      className="glow-hover feedback-card w-full overflow-hidden rounded-2xl border border-border bg-elevated"
    >
      {/* relative: paints above the glow-hover ::before (absolutely
          positioned, would otherwise cover this static content). */}
      <div className="relative">
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-accent to-transparent" />

        <div className="px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-text">
            Assessment Summary
          </h3>
          <span className="font-logo text-[10.5px] font-bold uppercase tracking-[0.2em] text-logo">
            ProbeAI
          </span>
        </div>
        <div className="mt-3 h-px w-full accent-line" />

        {feedback.summary && (
          <p className="mt-5 text-[16.5px] font-normal leading-[1.75] text-text">{feedback.summary}</p>
        )}

        <div className="mt-7 flex flex-col gap-6 md:flex-row md:gap-8">
          <Column title="Strengths" items={feedback.strengths} tone="good" />
          <Column title="Areas to Improve" items={feedback.gaps} tone="warn" />
        </div>

        {feedback.next?.length > 0 && (
          <section className="mt-8">
            <h4 className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.1em] text-text">
              <span className="text-info" aria-hidden="true">→</span>
              Recommended Next Steps
            </h4>
            <div className="mt-3 h-px w-full accent-line" />
            <ul className="mt-3 flex flex-col gap-2.5">
              {feedback.next.map((item, index) => (
                <li key={index} className="flex gap-2.5 text-[14.5px] font-normal leading-[1.65] text-text">
                  <span className="mt-[1px] shrink-0 font-semibold text-info" aria-hidden="true">→</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          onClick={onReset}
          className="glow-hover lift mt-9 w-full rounded-xl bg-btn-bg px-6 py-3.5
                     text-[15px] font-semibold tracking-wide text-btn-text glow-accent hover:bg-btn-hover
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted
                     focus-visible:ring-offset-2 focus-visible:ring-offset-elevated"
        >
          <span className="relative flex items-center justify-center gap-2.5">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
              <path d="M7 4.5v15l13-7.5z" />
            </svg>
            Start New Interview
          </span>
        </button>
        </div>
      </div>
    </article>
  )
}
