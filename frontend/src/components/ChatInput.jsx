/**
 * ChatInput — sticky answer box.
 * FRONTEND-ARCHITECTURE.md §6, §9
 */

import { useEffect, useRef } from 'react'

import { useChatDraft } from '../hooks/useChatDraft'

const MAX_HEIGHT = 108 // ~4 lines, then the textarea scrolls

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  )
}

export default function ChatInput({ onSend, disabled, autoFocusKey }) {
  const { draft, setDraft, canSend, submit } = useChatDraft(onSend, disabled)
  const textareaRef = useRef(null)

  // Auto-grow to a 4-line ceiling.
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`
  }, [draft])

  // Refocus once the response has landed. This runs after `disabled` flips
  // false — focusing any earlier targets a disabled element. §6
  useEffect(() => {
    if (disabled) return
    if (window.matchMedia('(min-width: 768px)').matches) {
      textareaRef.current?.focus()
    }
  }, [autoFocusKey, disabled])

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      textareaRef.current?.blur()
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-bg px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-chat items-end gap-3">
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <textarea
          id="answer"
          ref={textareaRef}
          rows={1}
          value={draft}
          disabled={disabled}
          placeholder="Type your answer…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          className="chat-scrollbar max-h-[108px] flex-1 resize-none rounded-xl border
                     border-input-border bg-input-bg px-4 py-3 text-[15px] leading-[1.6] text-text
                     transition-colors placeholder:text-text-muted focus:border-input-focus
                     focus:outline-none disabled:opacity-60"
        />

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send answer"
          className="send-btn mb-[2px] flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
                     bg-btn-bg text-btn-text transition-all hover:bg-btn-hover active:scale-95
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-input-focus
                     focus-visible:ring-offset-2 focus-visible:ring-offset-bg
                     disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-btn-bg
                     disabled:active:scale-100"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
