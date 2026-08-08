/**
 * PerformanceStats — a small analytics dashboard: an accuracy trend line, an
 * evaluation-breakdown bar chart, and an interview-volume area chart. All
 * hand-drawn SVG (no charting library, per the project's no-dependencies rule).
 *
 * Figures are static and illustrative. There is no telemetry endpoint yet
 * (API integration is handled separately), so nothing here is wired to a
 * live source — same category as the rest of the landing copy, not a claim
 * tied to a specific measured run.
 */

import { useCountUp } from '../hooks/useCountUp'
import { useInView } from '../hooks/useInView'

const ACCURACY_TREND = [87, 89, 88, 91, 93, 92, 95, 94, 96, 96]
const VOLUME_TREND = [180, 260, 230, 340, 310, 430, 400, 560, 650, 820, 1020, 1240]
const BREAKDOWN = [
  { label: 'Answer Evaluation', value: 94 },
  { label: 'Candidate Analysis', value: 97 },
  { label: 'Response Quality', value: 94 },
]

// --- pure chart math -------------------------------------------------------

function toPoints(data, width, height, pad, min, max) {
  const range = max - min || 1
  const usableW = width - pad * 2
  const usableH = height - pad * 2
  return data.map((v, i) => [
    pad + (i / (data.length - 1)) * usableW,
    pad + usableH - ((v - min) / range) * usableH,
  ])
}

// Catmull-Rom through every point, expressed as cubic Beziers — genuinely
// smooth (not just "midpoint-rounded"), still zero dependencies.
function smoothPath(points) {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0][0]},${points[0][1]} L ${points[1][0]},${points[1][1]}`
  }
  let d = `M ${points[0][0]},${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
  }
  return d
}

function areaPath(points, height, pad) {
  const first = points[0]
  const last = points[points.length - 1]
  return `${smoothPath(points)} L ${last[0]},${height - pad} L ${first[0]},${height - pad} Z`
}

// --- shared card chrome ------------------------------------------------------

function CardShell({ className = '', children }) {
  return (
    <div className={`glow-hover relative overflow-hidden rounded-2xl border border-border bg-surface px-4 py-5 sm:px-6 sm:py-6 xl:px-7 xl:py-7 ${className}`}>
      <span className="absolute inset-x-0 top-0 h-px accent-line" aria-hidden="true" />
      {/* Faint dot field, matching the page background, so the card doesn't
          read as a flat rectangle behind the chart. */}
      <span className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative">{children}</div>
    </div>
  )
}

function Delta({ value, suffix = '' }) {
  const positive = value >= 0
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold
                 ${positive ? 'bg-tintSuccess text-success' : 'bg-tintDanger text-danger'}`}
    >
      <svg viewBox="0 0 24 24" className={`h-3 w-3 ${positive ? '' : 'rotate-180'}`} fill="currentColor" aria-hidden="true">
        <path d="M12 5l7 8h-4v6h-6v-6H5z" />
      </svg>
      {positive ? '+' : ''}{value}{suffix}
    </span>
  )
}

/** Dashed, low-opacity horizontal rules — a technical-dashboard cue, not a border. */
function GridLines({ pad, width, height }) {
  const lines = [0.25, 0.5, 0.75].map((f) => pad + (height - pad * 2) * f)
  return lines.map((y) => (
    <line
      key={y}
      x1={pad} x2={width - pad} y1={y} y2={y}
      stroke="var(--border)" strokeWidth="1" strokeDasharray="1 5" strokeLinecap="round" opacity="0.8"
    />
  ))
}

// --- accuracy trend: hero line + area chart --------------------------------

function AccuracyTrendCard() {
  const [ref, inView] = useInView()
  const width = 440
  const height = 160
  const pad = 8
  const min = Math.min(...ACCURACY_TREND) - 4
  const max = 100
  const points = toPoints(ACCURACY_TREND, width, height, pad, min, max)
  const target = ACCURACY_TREND[ACCURACY_TREND.length - 1]
  const current = useCountUp(target, inView, 1300)
  const delta = +(target - ACCURACY_TREND[0]).toFixed(1)
  const [last] = points.slice(-1)

  return (
    <CardShell className="lg:col-span-2">
      <div ref={ref} className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-secondary xl:text-[13px]">
            Overall Accuracy
          </h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
            <span className="font-mono text-[28px] font-bold leading-none tabular-nums text-text sm:text-[34px] xl:text-[40px]">
              {current.toFixed(0)}%
            </span>
            <Delta value={delta} suffix="%" />
          </div>
          <p className="mt-1 text-[12.5px] font-normal text-text-muted xl:text-[13px]">Across the last 10 evaluation rounds</p>
        </div>
      </div>

      <div className="mt-5 h-40 w-full xl:h-48">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="accuracy-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
              <stop offset="55%" stopColor="var(--accent)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="accuracy-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent-muted)" />
              <stop offset="100%" stopColor="var(--accent-strong)" />
            </linearGradient>
            <filter id="accuracy-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <GridLines pad={pad} width={width} height={height} />

          <path
            d={areaPath(points, height, pad)}
            fill="url(#accuracy-area)"
            style={{ opacity: inView ? 1 : 0, transition: 'opacity 1000ms ease 350ms' }}
          />
          <path
            d={smoothPath(points)}
            fill="none"
            stroke="url(#accuracy-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            filter="url(#accuracy-glow)"
            style={{
              strokeDasharray: 100,
              strokeDashoffset: inView ? 0 : 100,
              transition: 'stroke-dashoffset 1300ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />

          {inView && (
            <>
              <circle cx={last[0]} cy={last[1]} r="4" fill="var(--accent-strong)">
                <animate attributeName="r" values="4;10;4" dur="2.6s" begin="1.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.45;0;0.45" dur="2.6s" begin="1.2s" repeatCount="indefinite" />
              </circle>
              <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--accent-strong)" stroke="var(--surface)" strokeWidth="1.5" />
            </>
          )}
        </svg>
      </div>
    </CardShell>
  )
}

// --- evaluation breakdown: vertical bar chart -------------------------------

function BreakdownCard() {
  const [ref, inView] = useInView()
  const max = 100

  return (
    <CardShell>
      <div ref={ref}>
        <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-secondary xl:text-[13px]">
          Evaluation Breakdown
        </h3>
        <p className="mt-1 text-[12.5px] font-normal text-text-muted xl:text-[13px]">By assessment dimension</p>

        {/* items-stretch (the flex default) so each column takes the row's
            full h-40 — the bar track below then uses flex-1 for its height,
            since a plain h-full on a child of an auto-height column resolves
            to nothing. */}
        <div className="mt-6 flex h-40 justify-between gap-4 xl:h-48 xl:gap-5">
          {BREAKDOWN.map((item, index) => (
            <div key={item.label} className="flex flex-1 flex-col items-center">
              <span className="font-mono text-[13px] font-semibold tabular-nums text-text">
                {item.value}%
              </span>
              <div className="mt-2 flex w-full flex-1 items-end overflow-hidden rounded-md bg-track">
                <div
                  className="relative w-full overflow-hidden rounded-md"
                  style={{
                    height: inView ? `${(item.value / max) * 100}%` : '0%',
                    background: 'linear-gradient(180deg, var(--accent-strong) 0%, var(--accent-muted) 100%)',
                    filter: 'drop-shadow(0 2px 8px var(--accent-glow))',
                    transition: `height 850ms cubic-bezier(0.16, 1, 0.3, 1) ${index * 130 + 150}ms`,
                  }}
                >
                  {/* Glossy highlight cap — reads as a real rendered bar,
                      not a flat CSS rectangle. */}
                  <span className="absolute inset-x-0 top-0 h-2 bg-white/40" aria-hidden="true" />
                </div>
              </div>
              <span className="mt-2 text-center text-[10.5px] font-medium leading-tight text-text-muted">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </CardShell>
  )
}

// --- interviews completed: volume area chart --------------------------------

function VolumeTrendCard() {
  const [ref, inView] = useInView()
  const width = 720
  const height = 120
  const pad = 6
  const total = VOLUME_TREND[VOLUME_TREND.length - 1]
  const displayed = useCountUp(total, inView, 1300)
  const weekly = total - VOLUME_TREND[VOLUME_TREND.length - 2]
  const points = toPoints(VOLUME_TREND, width, height, pad, 0, Math.max(...VOLUME_TREND) * 1.08)
  const [last] = points.slice(-1)

  return (
    <CardShell className="lg:col-span-3">
      <div ref={ref} className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-text-secondary xl:text-[13px]">
            Interviews Completed
          </h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
            <span className="font-mono text-[28px] font-bold leading-none tabular-nums text-text sm:text-[34px] xl:text-[40px]">
              {Math.round(displayed).toLocaleString()}+
            </span>
            <Delta value={weekly} suffix=" this week" />
          </div>
        </div>
      </div>

      <div className="mt-5 h-28 w-full xl:h-32">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="volume-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--info)" stopOpacity="0.32" />
              <stop offset="60%" stopColor="var(--info)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--info)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="volume-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent-muted)" />
              <stop offset="100%" stopColor="var(--info)" />
            </linearGradient>
            <filter id="volume-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <GridLines pad={pad} width={width} height={height} />

          <path
            d={areaPath(points, height, pad)}
            fill="url(#volume-area)"
            style={{ opacity: inView ? 1 : 0, transition: 'opacity 1000ms ease 350ms' }}
          />
          <path
            d={smoothPath(points)}
            fill="none"
            stroke="url(#volume-line)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            filter="url(#volume-glow)"
            style={{
              strokeDasharray: 100,
              strokeDashoffset: inView ? 0 : 100,
              transition: 'stroke-dashoffset 1400ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />

          {inView && (
            <circle cx={last[0]} cy={last[1]} r="3" fill="var(--info)" stroke="var(--surface)" strokeWidth="1.5" />
          )}
        </svg>
      </div>
    </CardShell>
  )
}

export default function PerformanceStats() {
  return (
    <section className="w-full">
      <div className="text-center">
        <h2 className="text-[20px] font-bold uppercase tracking-[0.08em] text-text sm:text-[22px] xl:text-[26px]">
          AI Performance
        </h2>
        <p className="mx-auto mt-2.5 max-w-md text-[15px] font-normal text-text-secondary xl:text-[16px]">
          Benchmarked internally across the cohort dataset.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-5 lg:grid-cols-3 xl:gap-6">
        <AccuracyTrendCard />
        <BreakdownCard />
        <VolumeTrendCard />
      </div>
    </section>
  )
}
