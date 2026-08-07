/**
 * ThemeToggle — icon-only, rotates 180° on switch.
 */


function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

export default function ThemeToggle({ isDark, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      // aria-label names the TARGET theme, not the current one.
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="glow-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border
                 border-transparent text-text-secondary transition-all duration-200 hover:border-border
                 hover:text-accent-strong hover:shadow-[0_0_16px_var(--accent-glow)] focus:outline-none
                 focus-visible:ring-2 focus-visible:ring-accent-muted"
    >
      {/* relative: paints above the glow-hover ::before, which is itself
          absolutely positioned and would otherwise cover static content. */}
      <span className={`relative block transition-transform duration-300 ${isDark ? 'rotate-0' : 'rotate-180'}`}>
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
    </button>
  )
}
