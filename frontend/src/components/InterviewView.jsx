/**
 * InterviewView — stats bar, transcript, input.
 */

import ChatInput from './ChatInput'
import ChatWindow from './ChatWindow'
import StatsBar from './StatsBar'

export default function InterviewView({
  messages,
  isLoading,
  isDone,
  feedback,
  error,
  startedAt,
  onSend,
  onRetry,
  onReset,
  onDismissError,
}) {
  // Each interviewer message carries exactly one question, so counting them is
  // exact — no guessing about what the backend asked.
  const questionCount = messages.filter((m) => m.role === 'interviewer').length
  const answerCount = messages.filter((m) => m.role === 'candidate').length

  return (
    <div className="view-enter flex min-h-0 flex-1 flex-col">
      <StatsBar
        questionCount={questionCount}
        answerCount={answerCount}
        startedAt={startedAt}
        isLoading={isLoading}
        isDone={isDone}
      />

      <ChatWindow
        messages={messages}
        isLoading={isLoading}
        isDone={isDone}
        feedback={feedback}
        onRetry={onRetry}
        onReset={onReset}
      />

      {error && (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <div
            role="alert"
            className="mx-auto flex w-full max-w-chat items-start gap-3 rounded-xl border
                       border-border bg-tintDanger px-4 py-2.5 text-[13px] text-text"
          >
            <span className="flex-1 font-normal leading-relaxed">{error.message}</span>
            {error.kind === 'session-expired' && (
              <button
                type="button"
                onClick={onReset}
                className="shrink-0 font-semibold underline underline-offset-2 focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-accent-muted"
              >
                Start new interview
              </button>
            )}
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss error"
              className="shrink-0 rounded px-1 text-text-muted transition-colors hover:text-text
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Once the interview ends the input is unmounted, not just disabled —
          the FeedbackCard carries "Start New Interview" from here. */}
      {!isDone && (
        <ChatInput onSend={onSend} disabled={isLoading} autoFocusKey={messages.length} />
      )}
    </div>
  )
}
