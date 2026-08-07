/**
 * StatsBar — the interview session bar: agent presence + live status on the
 * left, telemetry on the right.
 *
 * Everything shown here is derived from the transcript the client already has:
 * each interviewer message carries exactly one question, so counting them is
 * accurate. Nothing is invented — the backend does not expose which curriculum
 * day a question targets, so this reports questions, elapsed time and progress
 * rather than fabricating a topic count.
 */

import { Avatar } from './MessageBubble'
import { useElapsed } from '../hooks/useElapsed'

const TARGET_QUESTIONS = 10 // interviews run 8-12; ~10 is the honest midpoint

export default function StatsBar({ questionCount, answerCount, startedAt, isLoading, isDone }) {
  const elapsed = useElapsed(startedAt, isDone)
  const progress = isDone
    ? 100
    : Math.min(100, Math.round((questionCount / TARGET_QUESTIONS) * 100))

  const status = isDone ? 'Session complete' : isLoading ? 'Thinking…' : 'Listening'

  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-shell flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex shrink-0 items-center gap-3">
          <Avatar isActive={isLoading} />
          <div className="leading-tight">
            <div className="text-[13.5px] font-bold text-text">ProbeAI Interviewer</div>
            <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-secondary">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isDone ? 'bg-success' : isLoading ? 'bg-accent avatar-pulse' : 'bg-success'
                }`}
                aria-hidden="true"
              />
              {status}
            </div>
          </div>
        </div>

        <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />

        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
            <span className="font-bold text-text">{isDone ? 'Complete' : `Q ${questionCount}`}</span>
            {!isDone && <span className="text-text-secondary">/ ~{TARGET_QUESTIONS}</span>}
          </span>

          <span className="hidden shrink-0 text-[12.5px] font-medium text-text-secondary sm:inline">
            {answerCount} answered
          </span>

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full bg-track">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Interview progress"
              />
            </div>
            <span className="shrink-0 font-mono text-[12.5px] font-medium tabular-nums text-text-secondary">
              {elapsed}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
