/**
 * ChatInput — sticky answer box with the round send control.
 */

import { useEffect, useRef, useState } from 'react'

import { useChatDraft } from '../hooks/useChatDraft'

const MAX_HEIGHT = 112 // ~4 lines, then the textarea scrolls

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  )
}

export default function ChatInput({ onSend, disabled, autoFocusKey }) {
  const { draft, setDraft, canSend, submit } = useChatDraft(onSend, disabled)
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT)}px`
  }, [draft])

  // Refocus once the response has landed. This runs after `disabled` flips
  // false — focusing any earlier targets a disabled element.
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
    <div className="shrink-0 bg-bg">
      <div className="accent-line" />
      <div className="mx-auto flex w-full max-w-chat items-center gap-1.5 px-4 pt-2.5 sm:px-6">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
        <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">
          Live session
        </span>
      </div>
      <div className="mx-auto flex w-full max-w-chat items-end gap-3 px-4 pb-3 pt-2 sm:px-6">
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
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          className={`chat-scrollbar max-h-[112px] flex-1 resize-none rounded-xl border bg-input-bg
                      px-4 py-3 text-[15px] font-normal leading-[1.6] text-text outline-none
                      transition-all duration-200 placeholder:font-normal placeholder:text-text-muted
                      disabled:opacity-60
                      ${
                        isFocused
                          ? 'border-accent-muted shadow-[0_0_0_3px_var(--accent-glow)]'
                          : 'border-input-border'
                      }`}
        />

        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send answer"
          className="glow-hover mb-[2px] flex h-11 w-11 shrink-0 items-center
                     justify-center rounded-full bg-btn-bg text-btn-text transition-all duration-150
                     hover:bg-btn-hover active:scale-[0.93] focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent-muted focus-visible:ring-offset-2
                     focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-30
                     disabled:active:scale-100 enabled:hover:glow-accent"
        >
          {/* relative: paints above the glow-hover ::before. */}
          <span className="relative flex">
            <SendIcon />
          </span>
        </button>
      </div>
    </div>
  )
}
