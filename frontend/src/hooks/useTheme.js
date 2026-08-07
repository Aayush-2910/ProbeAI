/**
 * useTheme — dark/light toggle with persistence.
 * FRONTEND-ARCHITECTURE.md §3.3, §6
 */

import { useCallback, useState } from 'react'

const STORAGE_KEY = 'probeai-theme'

export function useTheme() {
  // Read the class the boot script in index.html already set. Re-deriving it
  // from localStorage here would reintroduce the light flash. §3.3
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )

  const toggleTheme = useCallback(() => {
    setIsDark((previous) => {
      const next = !previous
      document.documentElement.classList.toggle('dark', next)
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
      } catch {
        /* private mode — the toggle still works for this session */
      }
      return next
    })
  }, [])

  return { isDark, toggleTheme }
}
