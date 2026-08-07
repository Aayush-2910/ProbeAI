/**
 * ChatWindow — scrollable message area.
 */

import { useEffect, useRef } from 'react'

import FeedbackCard from './FeedbackCard'
import MessageBubble from './MessageBubble'
import TypingIndicator from './TypingIndicator'

export default function ChatWindow({ messages, isLoading, isDone, feedback, onRetry, onReset }) {
  const bottomRef = useRef(null)

  // Also fires when the typing indicator appears or the feedback card lands,
  // not only on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, isLoading, isDone])

  return (
    <div className="chat-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-chat flex-col">
        <div role="log" aria-live="polite" className="flex flex-col">
          {messages.map((message, index) => {
            const previous = messages[index - 1]
            const isGrouped = previous?.role === message.role
            return (
              <div key={message.id} className={isGrouped ? 'mt-1' : index === 0 ? '' : 'mt-5'}>
                <MessageBubble message={message} isGrouped={isGrouped} onRetry={onRetry} />
              </div>
            )
          })}
        </div>

        {isLoading && (
          <div className={messages.length ? 'mt-5' : ''}>
            <TypingIndicator />
          </div>
        )}

        {isDone && feedback && (
          <div className="mt-9 flex w-full flex-col gap-4">
            <div className="flex w-full items-center gap-3">
              <span className="h-px flex-1 accent-line" aria-hidden="true" />
              <span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[0.16em] text-text-secondary">
                Interview Complete
              </span>
              <span className="h-px flex-1 accent-line" aria-hidden="true" />
            </div>
            <FeedbackCard feedback={feedback} onReset={onReset} />
          </div>
        )}

        <div ref={bottomRef} className="h-px" />
      </div>
    </div>
  )
}
