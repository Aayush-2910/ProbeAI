/**
 * VoiceAssistantPanel — Siri-like voice interface shown while voice mode is
 * on. Slides in beside the transcript (desktop) or takes over the screen
 * (mobile) — see InterviewView.jsx for the layout half of this.
 *
 * Purely a visualization + control surface over useVoice(); it owns no audio
 * state of its own. The orb's animation state is one small derivation of the
 * hook's booleans, so this component can't drift out of sync with what the
 * mic/speaker are actually doing.
 *
 * The "glossy sphere" look on the orb is two plain radial-gradient overlays
 * (a white highlight, a black shadow) on top of the flat --btn-bg token —
 * not a new color token. --accent and --btn-bg collapse to the same lime in
 * dark mode, so there is no second brand hue to gradient between; white/black
 * overlays at low opacity read as depth on any flat base color in either
 * theme, which a token-to-token gradient could not do here.
 */

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5M8.5 21.5h7" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="3" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.9 6.2L20 10l-6.1 1.8L12 18l-1.9-6.2L4 10l6.1-1.8z" />
    </svg>
  )
}

function OrbWaveform() {
  const bars = [35, 65, 100, 55, 85, 40, 75, 50, 62]
  return (
    <span className="flex h-10 items-end gap-[3px]" aria-hidden="true">
      {bars.map((h, i) => (
        <span
          key={i}
          className="waveform-bar w-[3.5px] rounded-full bg-btn-text"
          style={{ height: `${h}%`, animationDelay: `${i * 0.09}s` }}
        />
      ))}
    </span>
  )
}

function ThinkingDots() {
  return (
    <span className="flex items-center gap-2" aria-hidden="true">
      <span className="dot h-2.5 w-2.5 rounded-full bg-btn-text" />
      <span className="dot h-2.5 w-2.5 rounded-full bg-btn-text" />
      <span className="dot h-2.5 w-2.5 rounded-full bg-btn-text" />
    </span>
  )
}

function status({ isRecording, isTranscribing, isSpeaking }, isThinking) {
  if (isRecording) return 'listening'
  if (isTranscribing) return 'transcribing'
  if (isThinking) return 'thinking'
  if (isSpeaking) return 'speaking'
  return 'idle'
}

const STATUS_COPY = {
  idle: 'Tap to speak',
  listening: 'Listening — tap to stop',
  transcribing: 'Transcribing…',
  thinking: 'ProbeAI is thinking…',
  speaking: 'Speaking — tap to interrupt',
}

const ORB_ANIMATION = {
  idle: 'voice-orb-idle',
  listening: 'voice-orb-listening',
  transcribing: '',
  thinking: '',
  speaking: 'voice-orb-speaking',
}

const RING_ANIMATION = {
  idle: 'voice-ring-idle',
  listening: 'voice-ring-active',
  transcribing: 'voice-ring-active',
  thinking: 'voice-ring-active',
  speaking: 'voice-ring-active',
}

export default function VoiceAssistantPanel({ voice, isThinking, onSend, onClose }) {
  const current = status(voice, isThinking)
  const interactive = current === 'idle' || current === 'listening' || current === 'speaking'
  const isLive = current !== 'idle'

  async function handleOrb() {
    if (!interactive) return
    voice.clearError()

    if (current === 'listening') {
      const text = await voice.stopRecording()
      if (text) onSend(text)
      return
    }
    if (current === 'speaking') {
      voice.stopSpeaking()
      return
    }
    voice.stopSpeaking()
    await voice.startRecording()
  }

  return (
    <div className="grid-bg flex h-full w-full flex-col bg-bg">
      <div className="shrink-0 border-b border-border bg-bg/70 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full ${isLive ? 'bg-accent-strong avatar-pulse' : 'bg-success'}`}
              aria-hidden="true"
            />
            <span className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-text">
              <SparkIcon />
              Voice Assistant
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="End voice session and return to text"
            title="End voice session"
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted
                       transition-colors hover:text-text focus:outline-none focus-visible:ring-2
                       focus-visible:ring-accent-muted"
          >
            <CloseIcon />
          </button>
        </div>
        <p className="mt-1 pl-[18px] text-[11.5px] font-medium text-text-muted">
          Speak naturally — your reply sends the moment you stop.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-8">
        <div className="voice-orb-enter relative flex h-[230px] w-[230px] items-center justify-center">
          {/* Ambient glow, always present but strongest while live. */}
          <div
            className={`absolute inset-3 rounded-full bg-accent blur-3xl transition-opacity duration-500
                        ${isLive ? 'opacity-[0.32]' : 'opacity-[0.12]'}`}
            aria-hidden="true"
          />

          {/* Scanning ring: a rotating conic arc masked to a thin band. */}
          <div
            className={`absolute h-[196px] w-[196px] rounded-full ${RING_ANIMATION[current]}`}
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0%, var(--accent-strong) 10%, transparent 24%, transparent 100%)',
              WebkitMask:
                'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px))',
              opacity: isLive ? 0.9 : 0.4,
            }}
            aria-hidden="true"
          />

          {/* Sonar rings — only while actively listening. */}
          {current === 'listening' && (
            <>
              <span
                className="voice-sonar absolute h-[150px] w-[150px] rounded-full border-2 border-accent-strong"
                style={{ animationDelay: '0s' }}
                aria-hidden="true"
              />
              <span
                className="voice-sonar absolute h-[150px] w-[150px] rounded-full border-2 border-accent-strong"
                style={{ animationDelay: '0.8s' }}
                aria-hidden="true"
              />
              <span
                className="voice-sonar absolute h-[150px] w-[150px] rounded-full border-2 border-accent-strong"
                style={{ animationDelay: '1.6s' }}
                aria-hidden="true"
              />
            </>
          )}

          <button
            type="button"
            onClick={handleOrb}
            disabled={!interactive}
            aria-label={
              current === 'listening'
                ? 'Stop listening and send'
                : current === 'speaking'
                  ? 'Interrupt and stop speaking'
                  : 'Start speaking'
            }
            className={`glow-hover relative flex h-[152px] w-[152px] items-center justify-center
                        overflow-hidden rounded-full bg-btn-bg text-btn-text
                        shadow-[0_8px_20px_rgba(0,0,0,0.28),0_0_60px_var(--accent-glow)]
                        transition-transform duration-300 focus:outline-none focus-visible:ring-2
                        focus-visible:ring-accent-muted focus-visible:ring-offset-4
                        focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-70
                        ${interactive ? 'active:scale-[0.96]' : ''} ${ORB_ANIMATION[current]}`}
          >
            {/* Glossy sphere overlays — highlight top-left, shadow bottom-right. */}
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle at 32% 26%, rgba(255,255,255,0.38), transparent 55%)' }}
              aria-hidden="true"
            />
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(circle at 70% 78%, rgba(0,0,0,0.22), transparent 60%)' }}
              aria-hidden="true"
            />

            <span className="relative flex items-center justify-center">
              {current === 'listening' || current === 'speaking' ? (
                <OrbWaveform />
              ) : current === 'thinking' || current === 'transcribing' ? (
                <ThinkingDots />
              ) : (
                <MicIcon />
              )}
            </span>

            {current === 'listening' && (
              <span
                className="absolute bottom-3.5 flex h-6 w-6 items-center justify-center rounded-full
                           bg-bg/70 text-btn-text"
                aria-hidden="true"
              >
                <StopIcon />
              </span>
            )}
          </button>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <p
            role="status"
            aria-live="polite"
            className="text-center text-[14px] font-semibold text-text"
          >
            {STATUS_COPY[current]}
          </p>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]
                        transition-colors duration-300
                        ${
                          isLive
                            ? 'border-accent-muted bg-surface text-accent-strong'
                            : 'border-border text-text-muted'
                        }`}
          >
            {current === 'idle' ? 'Ready' : current}
          </span>
        </div>

        {voice.error && (
          <p role="alert" className="max-w-[260px] text-center text-[12.5px] font-normal leading-relaxed text-danger">
            {voice.error}
          </p>
        )}
      </div>

      <div className="shrink-0 px-6 pb-6">
        <button
          type="button"
          onClick={onClose}
          className="lift w-full rounded-xl border border-border py-3 text-[13px] font-semibold
                     text-text-secondary transition-colors hover:border-danger hover:text-danger
                     focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-muted"
        >
          End voice session
        </button>
      </div>
    </div>
  )
}
