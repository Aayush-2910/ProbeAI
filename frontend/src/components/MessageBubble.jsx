/**
 * MessageBubble — one message, either side.
 * FRONTEND-ARCHITECTURE.md §3.2, §6, §8
 */

export default function MessageBubble({ message, isGrouped, onRetry }) {
  const isInterviewer = message.role === 'interviewer'
  const hasFailed = message.status === 'failed'

  if (isInterviewer) {
    return (
      <div className="message-enter flex w-full items-start gap-3">
        <div className="w-8 shrink-0">
          {!isGrouped && (
            <div
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border
                         bg-elevated text-[12px] font-semibold text-text-muted"
            >
              P
            </div>
          )}
        </div>
        <div
          className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-border
                     bg-bubble-interviewer px-[18px] py-[14px] text-[15px] leading-[1.7] text-text"
        >
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="message-enter flex w-full flex-col items-end">
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm px-[18px] py-[14px]
                    text-[15px] leading-[1.7] ${
                      hasFailed
                        ? 'border border-border bg-tintDanger text-text-muted'
                        : 'bg-bubble-candidate text-bubble-candidateText'
                    }`}
      >
        {message.content}
      </div>

      {hasFailed && (
        <p className="mt-1.5 flex items-center gap-2 text-[13px] text-danger">
          Message failed to send.
          <button
            type="button"
            onClick={onRetry}
            className="font-medium underline underline-offset-2 transition-opacity hover:opacity-80
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-input-focus"
          >
            Retry
          </button>
        </p>
      )}
    </div>
  )
}
