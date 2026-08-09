/**
 * InterviewView — stats bar, transcript, input.
 */

import { useEffect } from 'react'

import { useVoice } from '../hooks/useVoice'
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

  const voice = useVoice()
  // Destructured deliberately: the hook returns a fresh object every render, so
  // depending on `voice` itself would re-run these effects on every keystroke.
  // These four are stable useCallback/state references.
  const { voiceMode, available: voiceAvailable, speakOnce, stopSpeaking } = voice

  // Read each new interviewer message aloud while voice mode is on. Keyed by
  // message id so a re-render never restarts a question mid-sentence.
  const lastMessage = messages[messages.length - 1]
  useEffect(() => {
    if (!voiceMode || !voiceAvailable) return
    if (!lastMessage || lastMessage.role !== 'interviewer') return
    speakOnce(lastMessage.id ?? `msg-${messages.length}`, lastMessage.content)
  }, [lastMessage, messages.length, voiceMode, voiceAvailable, speakOnce])

  // Nothing should still be talking once the interview is over.
  useEffect(() => {
    if (isDone) stopSpeaking()
  }, [isDone, stopSpeaking])

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
            className="mx-auto flex w-full max-w-chat items-center gap-3 rounded-xl border
                       border-border bg-tintDanger py-1 pl-4 pr-1 text-[13px] text-text"
          >
            <span className="flex-1 py-1.5 font-normal leading-relaxed">{error.message}</span>
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
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-text-muted
                         transition-colors hover:text-text focus:outline-none focus-visible:ring-2
                         focus-visible:ring-accent-muted"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Once the interview ends the input is unmounted, not just disabled —
          the FeedbackCard carries "Start New Interview" from here. */}
      {!isDone && (
        <ChatInput
          onSend={onSend}
          disabled={isLoading}
          autoFocusKey={messages.length}
          voice={voice}
        />
      )}
    </div>
  )
}
