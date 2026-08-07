/**
 * TypingIndicator — the interviewer is thinking.
 * FRONTEND-ARCHITECTURE.md §6, §8
 *
 * Turns are LLM-bound and can take many seconds, so this is the primary
 * latency affordance, not decoration. §1.4
 */

export default function TypingIndicator() {
  return (
    <div className="message-enter flex w-full items-start gap-3" aria-label="ProbeAI is thinking">
      <div className="w-8 shrink-0">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border
                     bg-elevated text-[12px] font-semibold text-text-muted"
        >
          P
        </div>
      </div>

      <div
        className="flex items-center gap-2.5 rounded-2xl rounded-tl-sm border border-border
                   bg-bubble-interviewer px-4 py-3"
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-text-muted" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-text-muted" />
          <span className="typing-dot h-1.5 w-1.5 rounded-full bg-text-muted" />
        </span>
        <span className="text-[13px] text-text-muted">ProbeAI is thinking…</span>
      </div>
    </div>
  )
}
