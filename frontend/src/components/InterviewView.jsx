/**
 * InterviewView — the chat screen, during and after the interview.
 * FRONTEND-ARCHITECTURE.md §6
 */

import ChatInput from './ChatInput'
import ChatWindow from './ChatWindow'

export default function InterviewView({
  messages,
  isLoading,
  isDone,
  feedback,
  error,
  onSend,
  onRetry,
  onReset,
  onDismissError,
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
                       border-border bg-tintDanger px-4 py-2.5 text-[14px] text-text"
          >
            <span className="flex-1">{error.message}</span>
            {error.kind === 'session-expired' && (
              <button
                type="button"
                onClick={onReset}
                className="shrink-0 font-medium underline underline-offset-2 focus:outline-none
                           focus-visible:ring-2 focus-visible:ring-input-focus"
              >
                Start new interview
              </button>
            )}
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Dismiss error"
              className="shrink-0 rounded px-1 text-text-muted transition-colors hover:text-text
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-input-focus"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Once the interview ends the input is unmounted, not just disabled —
          the FeedbackCard carries "Start New Interview" from here. §6 */}
      {!isDone && (
        <ChatInput onSend={onSend} disabled={isLoading} autoFocusKey={messages.length} />
      )}
    </div>
  )
}
