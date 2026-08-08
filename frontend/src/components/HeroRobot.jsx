/**
 * HeroRobot — the robot image plus five independently-floating glass UI
 * cards around it, each modeled on a real piece of the interview interface
 * (live question, progress, AI evaluation, candidate response, skill
 * analysis). The image and the cards are deliberately separate elements —
 * not baked into one graphic — so each card can animate and be edited on
 * its own.
 *
 * Image: frontend/public/Probe-robo.png — Vite serves anything in public/
 * from the site root, so it's referenced here as plain "/Probe-robo.png".
 * If the file is ever missing, a placeholder mark renders instead of a
 * broken-image icon.
 */

import { useState } from 'react'

// --- small shared pieces -----------------------------------------------

function IconChip({ children }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border
                 border-accent-muted bg-elevated text-accent-strong"
      aria-hidden="true"
    >
      {children}
    </span>
  )
}

function MiniBar({ pct }) {
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-track" aria-hidden="true">
      <span className="block h-full rounded-full bg-accent-strong" style={{ width: `${pct}%` }} />
    </span>
  )
}

function Waveform() {
  const bars = [45, 80, 100, 60, 90, 40, 70]
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {bars.map((h, i) => (
        <span
          key={i}
          className="waveform-bar w-[3px] rounded-full bg-accent-strong"
          style={{ height: `${h}%`, animationDelay: `${i * 0.11}s` }}
        />
      ))}
    </span>
  )
}

function LiveDot() {
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-danger" />
      </span>
      <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-danger">Live</span>
    </span>
  )
}

// --- icons ----------------------------------------------------------------

function QuestionIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16v11H8l-4 4V5z" />
    </svg>
  )
}
function ProgressIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19V10M12 19V5M20 19v-6" />
    </svg>
  )
}
function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  )
}
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}
function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  )
}

function PlaceholderMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-16 w-16 text-accent-muted" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="7" width="14" height="12" rx="3" />
      <path d="M9 3.5v3.5M15 3.5v3.5M9 13h.01M15 13h.01M9.5 16.5c.9.7 4.1.7 5 0" />
      <path d="M2.5 11v4M21.5 11v4" />
    </svg>
  )
}

// --- the floating cards themselves -----------------------------------------

function FloatingCard({ position, floatClass, delay, className = '', children }) {
  return (
    <div
      className={`glass-card absolute hidden w-[178px] flex-col gap-1.5 rounded-2xl border
                 border-accent-muted bg-glassCard px-3.5 py-3 backdrop-blur-md sm:flex
                 ${floatClass} ${position} ${className}`}
      style={{ animationDelay: delay }}
      aria-hidden="true"
    >
      {children}
    </div>
  )
}

function CardLabel({ icon, children, trailing }) {
  return (
    <span className="flex items-center gap-2">
      <IconChip>{icon}</IconChip>
      <span className="flex-1 text-[10px] font-bold uppercase leading-tight tracking-[0.05em] text-text-secondary">
        {children}
      </span>
      {trailing}
    </span>
  )
}

export default function HeroRobot() {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <div className="relative flex w-full max-w-[360px] shrink-0 items-center justify-center
                    sm:max-w-[420px] lg:ml-8 lg:w-[460px] lg:max-w-none xl:ml-14 xl:w-[520px]">
      {/* Ambient glow behind the robot, matching the accent used everywhere else. */}
      <div
        className="absolute inset-[8%] -z-10 rounded-full bg-accent opacity-[0.14] blur-3xl"
        aria-hidden="true"
      />

      {/* Probe-robo.png is a 3264x3264 square (1:1) — matching the container
          to it avoids object-contain letterboxing top/bottom. */}
      <div className="relative aspect-square w-full">
        {imageFailed ? (
          <div className="flex h-full w-full items-center justify-center rounded-3xl border
                          border-dashed border-border bg-surface">
            <PlaceholderMark />
          </div>
        ) : (
          <img
            src="/Probe-robo.png"
            alt="ProbeAI interview assistant"
            className="h-full w-full object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.25)]"
            onError={() => setImageFailed(true)}
          />
        )}

        {/* Live Question — top-left */}
        <FloatingCard position="-left-[2%] top-[3%]" floatClass="float-a" delay="0s">
          <CardLabel icon={<QuestionIcon />} trailing={<LiveDot />}>
            Live Question
          </CardLabel>
          <p className="truncate text-[11.5px] font-medium italic leading-snug text-text">
            &ldquo;Walk me through your RAG pipeline…&rdquo;
          </p>
        </FloatingCard>

        {/* AI Evaluation — top-right */}
        <FloatingCard position="-right-[4%] top-[8%]" floatClass="float-b" delay="0.5s">
          <CardLabel icon={<SparkIcon />}>AI Evaluation</CardLabel>
          <span className="flex items-baseline gap-1.5">
            <span className="font-mono text-[19px] font-bold leading-none text-accent-strong">92</span>
            <span className="text-[10.5px] font-semibold text-text-muted">/100 depth</span>
          </span>
        </FloatingCard>

        {/* Interview Progress — right, mid-height */}
        <FloatingCard position="-right-[6%] top-[47%]" floatClass="float-c" delay="0.2s">
          <CardLabel icon={<ProgressIcon />}>Progress</CardLabel>
          <div className="flex items-center gap-2">
            <MiniBar pct={60} />
            <span className="shrink-0 font-mono text-[11px] font-bold text-text">6/10</span>
          </div>
        </FloatingCard>

        {/* Candidate Response — bottom-left */}
        <FloatingCard position="-left-[4%] bottom-[18%]" floatClass="float-b" delay="0.8s">
          <CardLabel icon={<MicIcon />}>Candidate Response</CardLabel>
          <span className="flex items-center gap-2">
            <Waveform />
            <span className="text-[10.5px] font-semibold text-text-secondary">Speaking…</span>
          </span>
        </FloatingCard>

        {/* Skill Analysis — bottom-right */}
        <FloatingCard position="-right-[1%] bottom-[2%]" floatClass="float-a" delay="1.1s">
          <CardLabel icon={<TargetIcon />}>Skill Analysis</CardLabel>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[10px] font-semibold text-text-muted">RAG</span>
              <MiniBar pct={90} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[10px] font-semibold text-text-muted">Prompting</span>
              <MiniBar pct={72} />
            </div>
          </div>
        </FloatingCard>
      </div>
    </div>
  )
}
