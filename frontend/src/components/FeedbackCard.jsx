/**
 * FeedbackCard — the closing assessment.
 * FRONTEND-ARCHITECTURE.md §6, §8
 */

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-[6px] h-3.5 w-3.5 shrink-0 text-marker-good" fill="none"
      stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-[5px] h-3.5 w-3.5 shrink-0 text-warn" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 4v10M12 19v.5" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-[6px] h-3.5 w-3.5 shrink-0 text-marker-next" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h13M12 6l6 6-6 6" />
    </svg>
  )
}

function Section({ title, items, icon: Icon }) {
  // Empty arrays render nothing — no orphaned headers. §6
  if (!items?.length) return null

  return (
    <section className="mt-6">
      <h4 className="text-[13px] font-semibold uppercase tracking-wider text-text-muted">{title}</h4>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((item, index) => (
          <li key={index} className="flex gap-3 text-[15px] leading-[1.65] text-text">
            <Icon />
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
      className="feedback-enter w-full rounded-2xl border border-border border-l-[3px] border-l-accent
                 bg-elevated px-6 py-6 sm:px-7"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[19px] font-semibold text-text">Interview Complete</h3>
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-logo">ProbeAI</span>
      </div>

      {feedback.summary && (
        <p className="mt-4 border-b border-border pb-6 text-[16px] leading-[1.7] text-text">
          {feedback.summary}
        </p>
      )}

      <Section title="Strengths" items={feedback.strengths} icon={CheckIcon} />
      {/* Never labelled "Gaps" in the UI — same data, softer framing. §6 */}
      <Section title="Areas for Improvement" items={feedback.gaps} icon={AlertIcon} />
      <Section title="Recommended Next Steps" items={feedback.next} icon={ArrowIcon} />

      <div className="mt-8 border-t border-border pt-5">
        <button
          type="button"
          onClick={onReset}
          className="w-full rounded-xl bg-btn-bg px-5 py-3 text-[15px] font-semibold text-btn-text
                     transition-colors hover:bg-btn-hover focus:outline-none focus-visible:ring-2
                     focus-visible:ring-input-focus focus-visible:ring-offset-2
                     focus-visible:ring-offset-elevated sm:w-auto sm:px-8"
        >
          Start New Interview
        </button>
      </div>
    </article>
  )
}
