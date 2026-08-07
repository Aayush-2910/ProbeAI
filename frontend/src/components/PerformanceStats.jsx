/**
 * PerformanceStats — trust/credibility section with animated radial gauges
 * and a trend chart, all hand-drawn SVG (no charting library).
 *
 * Figures are static and illustrative. There is no telemetry endpoint yet
 * (API integration is handled separately), so nothing here is wired to a
 * live source — same category as the rest of the landing copy, not a claim
 * tied to a specific measured run.
 */

import { useEffect, useState } from 'react'


const GAUGES = [
  { id: 'overall', label: 'Overall Accuracy', value: '96', unit: '%', progress: 96 },
  { id: 'answer', label: 'Answer Evaluation', value: '94', unit: '%', progress: 94 },
  { id: 'candidate', label: 'Candidate Analysis', value: '97', unit: '%', progress: 97 },
  { id: 'quality', label: 'Response Quality', value: '4.7', unit: '/5', progress: 94 },
]

const TREND = {
  label: 'Interviews Completed',
  value: '1,240',
  suffix: '+',
  bars: [38, 52, 47, 66, 60, 82, 100],
}

function RadialGauge({ label, value, unit, progress, delay }) {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(progress), 150 + delay)
    return () => clearTimeout(timer)
  }, [progress, delay])

  const size = 136
  const stroke = 11
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animated / 100) * circumference
  const gradientId = `gauge-grad-${label.replace(/\s+/g, '-')}`

  return (
    <div
      className="glow-hover relative overflow-hidden rounded-2xl border border-border bg-surface px-6 py-8"
    >
      <span className="absolute inset-x-0 top-0 h-px accent-line" aria-hidden="true" />

      {/* relative: paints above the glow-hover ::before (absolutely
          positioned, would otherwise cover this static content). */}
      <div className="relative flex flex-col items-center">
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-muted)" />
                <stop offset="100%" stopColor="var(--accent)" />
              </linearGradient>
            </defs>
            <circle
              cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke="var(--track)" strokeWidth={stroke}
            />
            <circle
              cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke={`url(#${gradientId})`} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1100ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-[28px] font-bold tabular-nums leading-none text-text">
              {value}
            </span>
            <span className="mt-1.5 text-[13px] font-semibold text-accent-strong">{unit}</span>
          </div>
        </div>

        <div className="mt-5 text-center text-[13.5px] font-semibold uppercase tracking-[0.05em] text-text-secondary">
          {label}
        </div>
      </div>
    </div>
  )
}

function TrendCard() {
  const max = Math.max(...TREND.bars)

  return (
    <div
      className="glow-hover relative flex h-full flex-col overflow-hidden rounded-2xl border
                border-border bg-surface px-6 py-8"
    >
      <span className="absolute inset-x-0 top-0 h-px accent-line" aria-hidden="true" />

      {/* relative: paints above the glow-hover ::before. */}
      <div className="relative flex flex-1 flex-col">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-[32px] font-bold tabular-nums leading-none text-text">
            {TREND.value}
          </span>
          <span className="text-[15px] font-semibold text-accent-strong">{TREND.suffix}</span>
        </div>
        <div className="mt-2.5 text-[13.5px] font-semibold uppercase tracking-[0.05em] text-text-secondary">
          {TREND.label}
        </div>

        <div
          className="mt-auto flex h-20 items-end gap-2 pt-6"
          role="img"
          aria-label="Interviews completed, trending up"
        >
          {TREND.bars.map((bar, index) => (
            <span
              key={index}
              className="flex-1 rounded-t-sm bg-accent transition-all duration-700 ease-out"
              style={{
                height: `${(bar / max) * 100}%`,
                opacity: 0.35 + (index / (TREND.bars.length - 1)) * 0.65,
                transitionDelay: `${150 + index * 60}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PerformanceStats() {
  return (
    <section className="w-full">
      <div className="text-center">
        <h2 className="text-[20px] font-bold uppercase tracking-[0.08em] text-text sm:text-[22px]">
          AI Performance
        </h2>
        <p className="mx-auto mt-2.5 max-w-md text-[15px] font-normal text-text-secondary">
          Benchmarked internally across the cohort dataset.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5 lg:gap-6">
        {GAUGES.map((gauge, index) => (
          <RadialGauge key={gauge.id} {...gauge} delay={index * 120} />
        ))}
        <div className="col-span-2 sm:col-span-3 lg:col-span-1">
          <TrendCard />
        </div>
      </div>
    </section>
  )
}
