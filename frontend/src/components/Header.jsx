/**
 * Header — top bar, ~60px, 1px bottom border.
 * Track A · FRONTEND-ARCHITECTURE.md §3.2, §6
 *
 * Props: { candidate, isDark, toggleTheme }
 *
 * Left:   PROBEAI logo — uppercase, tracking-[0.25em] (or font-mono),
 *         accent in dark / --text in light.
 *         Tagline "An AI That Doesn't Just Ask. It Probes." — hidden below md.
 * Center: candidate pill, rendered ONLY when candidate is set.
 *         formatCandidatePill(c) -> "Sarah Johnson | Senior Data Engineer | 9y exp"
 *         Muted text, subtle border, compact. Truncates — never wraps.
 *         Narrow-viewport truncation order (§14.3): drop years, then role.
 * Right:  <ThemeToggle isDark onToggle={toggleTheme} />
 *
 * TODO(track-a): implement.
 */
