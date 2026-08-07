/**
 * HowItWorks — orientation for first-time visitors: the five-step flow from
 * picking a candidate to reading the assessment. Each step is an interactive
 * card (border-glow + lift on hover) that eases into view as it scrolls in.
 */

import { useInView } from '../hooks/useInView'

function SelectIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="8" r="3" />
      <path d="M4 19c0-3 2.7-5.3 6-5.3s6 2.3 6 5.3" />
      <path d="M17 8l2 2 3.5-3.5" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M10.5 8.5v7l6-3.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16v11H8l-4 4V5z" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    </svg>
  )
}

function ResultIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 10.5l2 2 4-4.5M8.5 15h7" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 rotate-90 text-accent-muted sm:rotate-0" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

const STEPS = [
  {
    icon: SelectIcon,
    title: 'Select Agent',
    desc: 'Pick a candidate profile from the cohort roster.',
  },
  {
    icon: PlayIcon,
    title: 'Start Interview',
    desc: 'The interviewer opens with a question tailored to their background.',
  },
  {
    icon: ChatIcon,
    title: 'Answer Questions',
    desc: 'Respond naturally — vague answers get a same-topic follow-up.',
  },
  {
    icon: SparkIcon,
    title: 'AI Evaluates',
    desc: 'Every answer is read for depth and specifics, not keywords.',
  },
  {
    icon: ResultIcon,
    title: 'Get Results',
    desc: 'A structured assessment: strengths, gaps, and next steps.',
  },
]

function Connector() {
  return (
    <div className="flex shrink-0 items-center justify-center py-1 sm:flex-col sm:py-0" aria-hidden="true">
      <ChevronIcon />
    </div>
  )
}

function StepCard({ step, index }) {
  const [ref, inView] = useInView()
  const Icon = step.icon

  return (
    <div
      ref={ref}
      style={{ transitionDelay: inView ? `${index * 90}ms` : '0ms' }}
      className={`glow-hover lift group relative flex flex-1 flex-col items-center rounded-2xl
                 border border-border bg-surface px-5 py-8 text-center transition-all
                 duration-500 ease-out hover:bg-hover
                 ${inView ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'}`}
    >
      <div className="relative">
        <span
          className="flex h-16 w-16 items-center justify-center rounded-full border
                     border-accent-muted bg-elevated text-accent-strong transition-transform
                     duration-300 group-hover:scale-110"
          aria-hidden="true"
        >
          <Icon />
        </span>
        <span
          className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full
                     bg-accent text-[11px] font-bold text-[var(--btn-text)] shadow-[0_0_10px_var(--accent-glow)]"
          aria-hidden="true"
        >
          {index + 1}
        </span>
      </div>

      <h3 className="mt-5 text-[16.5px] font-bold text-text">{step.title}</h3>
      <p className="mt-2 max-w-[210px] text-[14px] font-normal leading-relaxed text-text-secondary">
        {step.desc}
      </p>
    </div>
  )
}

export default function HowItWorks() {
  return (
    <section className="w-full">
      <div className="text-center">
        <h2 className="text-[20px] font-bold uppercase tracking-[0.08em] text-text sm:text-[22px]">
          How ProbeAI Works
        </h2>
        <p className="mx-auto mt-2.5 max-w-md text-[15px] font-normal text-text-secondary">
          From candidate to assessment in five steps.
        </p>
      </div>

      <div className="mt-12 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
        {STEPS.map((step, index) => (
          <div key={step.title} className="flex flex-col sm:contents">
            <StepCard step={step} index={index} />
            {index < STEPS.length - 1 && <Connector />}
          </div>
        ))}
      </div>
    </section>
  )
}
