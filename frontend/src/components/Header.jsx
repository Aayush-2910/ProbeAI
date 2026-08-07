/**
 * Header — glass bar with the wordmark, candidate pill and theme toggle.
 */

import { candidatePillParts } from '../utils/helpers'
import ThemeToggle from './ThemeToggle'

export default function Header({ candidate, isDark, toggleTheme, isDemo }) {
  const pill = candidate ? candidatePillParts(candidate) : null

  return (
    <header className="glass sticky top-0 z-50 shrink-0">
      <div className="flex h-[56px] items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 shrink-0 flex-col justify-center">
          <span className="font-logo text-[15px] font-bold uppercase leading-none tracking-[0.28em] text-logo text-glow">
            ProbeAI
          </span>
          <span className="mt-1.5 hidden text-[11.5px] font-medium leading-none text-text-secondary lg:block">
            An AI That Doesn&apos;t Just Ask. It Probes.
          </span>
        </div>

        <div className="flex min-w-0 flex-1 justify-center">
          {pill && (
            // Truncation order on narrow viewports: years first, then role.
            <div className="flex min-w-0 items-center gap-2 truncate rounded-full border border-border
                            bg-surface px-3.5 py-1.5 text-[13px] font-medium text-text-secondary">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-strong" aria-hidden="true" />
              <span className="min-w-0 truncate font-semibold text-text">{pill.name}</span>
              {pill.role && (
                <>
                  <span className="hidden text-border sm:inline" aria-hidden="true">|</span>
                  <span className="hidden truncate sm:inline">{pill.role}</span>
                </>
              )}
              <span className="hidden text-border md:inline" aria-hidden="true">|</span>
              <span className="hidden whitespace-nowrap md:inline">{pill.years}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isDemo && (
            <span
              title="Running on bundled sample data — no backend connected"
              className="hidden rounded-full border border-border px-2.5 py-1 text-[10.5px] font-semibold
                         uppercase tracking-[0.09em] text-text-secondary sm:inline"
            >
              Demo data
            </span>
          )}
          <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
        </div>
      </div>

      <div className="accent-line" />
    </header>
  )
}
