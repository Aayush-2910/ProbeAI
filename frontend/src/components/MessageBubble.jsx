/**
 * MessageBubble — one message, either side.
 */

export function Avatar({ isActive }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-9 w-9 items-center justify-center rounded-full border border-accent-muted
                  bg-surface text-[12px] font-semibold text-accent-strong
                  ${isActive ? 'avatar-pulse' : ''}`}
    >
      P
    </span>
  )
}

export default function MessageBubble({ message, isGrouped, onRetry }) {
  const isInterviewer = message.role === 'interviewer'
  const hasFailed = message.status === 'failed'

  if (isInterviewer) {
    return (
      <div className="msg-enter flex w-full items-start gap-3">
        <div className="w-9 shrink-0">{!isGrouped && <Avatar />}</div>
        <div
          className="max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-tl-[4px] border border-border
                     border-l-2 border-l-accent-muted bg-bubble-interviewer px-[18px] py-[14px]
                     text-[15px] leading-[1.7] text-text"
        >
          {message.content}
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
                        : 'bg-bubble-candidate text-bubble-candidateText'
                    }`}
      >
        {message.content}
      </div>

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
