/**
 * Header — top bar, ~60px.
 * FRONTEND-ARCHITECTURE.md §3.2, §6
 */

import { candidatePillParts } from '../utils/helpers'
import ThemeToggle from './ThemeToggle'

export default function Header({ candidate, isDark, toggleTheme }) {
  const pill = candidate ? candidatePillParts(candidate) : null

  return (
    <header className="flex h-[60px] shrink-0 items-center gap-4 border-b border-border px-4 sm:px-6">
      <div className="flex min-w-0 shrink-0 flex-col justify-center">
        <span className="text-[15px] font-semibold uppercase leading-none tracking-[0.25em] text-logo">
          ProbeAI
        </span>
        <span className="mt-1 hidden text-[11px] leading-none text-text-muted lg:block">
          An AI That Doesn&apos;t Just Ask. It Probes.
        </span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        {pill && (
          // Truncation order on narrow viewports: years first, then role. §14.3
          <div className="flex min-w-0 items-center gap-2 truncate rounded-full border border-border
                          bg-surface px-3 py-1.5 text-[13px] text-text-muted">
            <span className="truncate font-medium text-text">{pill.name}</span>
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

      <div className="shrink-0">
        <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
      </div>
    </header>
  )
}
