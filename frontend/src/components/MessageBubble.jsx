/**
 * MessageBubble — one message, either side.
 */

import { formatMessageTime } from '../utils/helpers'

/** Shared interviewer avatar: a small always-on presence dot, plus a radar
 * ping (avatar-pulse) while the AI is actively "thinking". */
export function Avatar({ isActive, size = 'md' }) {
  const dims = size === 'lg' ? 'h-11 w-11 text-[13px]' : 'h-9 w-9 text-[12px]'
  return (
    <span className={`relative inline-flex shrink-0 ${size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'}`}>
      <span
        aria-hidden="true"
        className={`flex ${dims} items-center justify-center rounded-full border border-accent-muted
                    bg-surface font-semibold text-accent-strong
                    ${isActive ? 'avatar-pulse' : ''}`}
      >
        P
      </span>
      <span
        aria-hidden="true"
        className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface
                   ${isActive ? 'bg-accent-strong' : 'bg-success'}`}
      />
    </span>
  )
}

export default function MessageBubble({ message, isGrouped, isLastInGroup, onRetry }) {
  const isInterviewer = message.role === 'interviewer'
  const hasFailed = message.status === 'failed'
  const time = isLastInGroup ? formatMessageTime(message.timestamp) : ''

  if (isInterviewer) {
    return (
      <div className="msg-enter flex w-full items-start gap-3">
        <div className="w-9 shrink-0">{!isGrouped && <Avatar />}</div>
        <div className="flex max-w-[75%] flex-col items-start">
          <div
            className="whitespace-pre-wrap rounded-2xl rounded-tl-[4px] border border-border
                       border-l-2 border-l-accent-muted bg-bubble-interviewer px-[18px] py-[14px]
                       text-[15px] leading-[1.7] text-text shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
          >
            {message.content}
          </div>
          {time && (
            <span className="mt-1.5 px-1 text-[11px] font-normal text-text-muted">{time}</span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="msg-enter flex w-full flex-col items-end">
      <div
        className={`max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-tr-[4px] px-[18px] py-[14px]
                    text-[15px] leading-[1.7] ${
                      hasFailed
                        ? 'border border-border bg-tintDanger text-text-secondary'
                        : 'bg-bubble-candidate text-bubble-candidateText shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                    }`}
      >
        {message.content}
      </div>

      {time && !hasFailed && (
        <span className="mt-1.5 px-1 text-[11px] font-normal text-text-muted">{time}</span>
      )}

      {hasFailed && (
        <p className="mt-1.5 flex items-center gap-2 text-[12.5px] font-medium text-danger">
          Message failed to send.
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold underline underline-offset-2 transition-opacity hover:opacity-80
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted"
          >
            Retry
          </button>
        </p>
      )}
    </div>
  )
}
