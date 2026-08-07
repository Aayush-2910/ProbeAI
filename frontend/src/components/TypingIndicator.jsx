/**
 * TypingIndicator — the interviewer is working.
 *
 * Turns are LLM-bound and can take many seconds, so this is the primary
 * latency affordance, not decoration. The avatar pings while it shows.
 */

import { Avatar } from './MessageBubble'

export default function TypingIndicator() {
  return (
    <div className="msg-enter flex w-full items-start gap-3" aria-label="ProbeAI is thinking">
      <div className="w-9 shrink-0">
        <Avatar isActive />
      </div>

      <div
        className="flex items-center gap-2.5 rounded-2xl rounded-tl-[4px] border border-border
                   border-l-2 border-l-accent-muted bg-bubble-interviewer px-4 py-3.5
                   shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="dot h-1.5 w-1.5 rounded-full bg-accent-strong" />
          <span className="dot h-1.5 w-1.5 rounded-full bg-accent-strong" />
          <span className="dot h-1.5 w-1.5 rounded-full bg-accent-strong" />
        </span>
        <span className="text-[12.5px] font-medium text-text-secondary">ProbeAI is thinking…</span>
      </div>
    </div>
  )
}
