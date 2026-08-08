/**
 * ChatInput — sticky answer box with the round send control, plus voice.
 *
 * The microphone appears only when the backend reports a working ElevenLabs
 * key. Speaking transcribes into the same draft the keyboard writes to, so an
 * answer can be spoken, then edited, then sent — and in voice mode it sends
 * itself. Text and voice are one input, not two modes fighting over a box.
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

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] animate-spin" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    </svg>
  )
}

function SpeakerIcon({ muted }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      {muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M17 8.5a5 5 0 0 1 0 7" />}
    </svg>
  )
}

export default function ChatInput({ onSend, disabled, autoFocusKey, voice }) {
  const { draft, setDraft, canSend, submit } = useChatDraft(onSend, disabled)
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef(null)

  const busy = voice?.isRecording || voice?.isTranscribing

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

  async function handleMic() {
    if (!voice) return
    voice.clearError()

    if (voice.isRecording) {
      const text = await voice.stopRecording()
      if (!text) return

      // In voice mode the spoken answer goes straight through, so the
      // conversation stays hands-free. Otherwise it lands in the box to be
      // read over and edited first.
      if (voice.voiceMode) {
        onSend(text)
        setDraft('')
      } else {
        setDraft(draft ? `${draft.trim()} ${text}` : text)
        textareaRef.current?.focus()
      }
      return
    }

    voice.stopSpeaking()
    await voice.startRecording()
  }

  const statusLabel = voice?.isRecording
    ? 'Listening…'
    : voice?.isTranscribing
      ? 'Transcribing…'
      : voice?.isSpeaking
        ? 'Speaking…'
        : 'Live session'

  return (
    <div className="shrink-0 bg-bg">
      <div className="accent-line" />

      <div className="mx-auto flex w-full max-w-chat items-center gap-1.5 px-4 pt-2.5 sm:px-6">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            voice?.isRecording ? 'animate-pulse bg-danger' : 'bg-success'
          }`}
          aria-hidden="true"
        />
        <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-text-muted">
          {statusLabel}
        </span>

        {voice?.available && (
          <button
            type="button"
            onClick={voice.toggleVoiceMode}
            aria-pressed={voice.voiceMode}
            title={
              voice.voiceMode
                ? 'Voice mode on — answers send as you speak and replies are read aloud'
                : 'Voice mode off — the mic only dictates into the box'
            }
            className={`ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1
                        text-[10.5px] font-medium uppercase tracking-[0.06em] transition-colors
                        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted
                        ${
                          voice.voiceMode
                            ? 'border-accent-muted bg-surface text-accent-strong'
                            : 'border-border text-text-muted hover:text-text'
                        }`}
          >
            <SpeakerIcon muted={!voice.voiceMode} />
            Voice
          </button>
        )}
      </div>

      {voice?.error && (
        <div className="mx-auto w-full max-w-chat px-4 pt-2 sm:px-6">
          <p role="status" className="text-[12.5px] font-normal leading-relaxed text-danger">
            {voice.error}
          </p>
        </div>
      )}

      <div className="mx-auto flex w-full max-w-chat items-end gap-2.5 px-4 pb-3 pt-2 sm:px-6">
        <label htmlFor="answer" className="sr-only">
          Your answer
        </label>
        <textarea
          id="answer"
          ref={textareaRef}
          rows={1}
          value={draft}
          disabled={disabled || busy}
          placeholder={voice?.isRecording ? 'Listening — speak your answer…' : 'Type your answer…'}
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

        {voice?.available && (
          <button
            type="button"
            onClick={handleMic}
            disabled={disabled || voice.isTranscribing}
            aria-label={voice.isRecording ? 'Stop recording and send' : 'Record your answer'}
            title={voice.isRecording ? 'Stop recording' : 'Record your answer'}
            className={`mb-[2px] flex h-11 w-11 shrink-0 items-center justify-center rounded-full
                        border transition-all duration-150 active:scale-[0.93] focus:outline-none
                        focus-visible:ring-2 focus-visible:ring-accent-muted
                        focus-visible:ring-offset-2 focus-visible:ring-offset-bg
                        disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100
                        ${
                          voice.isRecording
                            ? 'animate-pulse border-danger bg-tintDanger text-danger'
                            : 'border-input-border bg-input-bg text-text-secondary hover:text-text'
                        }`}
          >
            {voice.isTranscribing ? <Spinner /> : voice.isRecording ? <StopIcon /> : <MicIcon />}
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSend || busy}
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
