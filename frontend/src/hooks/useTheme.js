/**
 * useTheme — dark/light toggle with persistence.
 * Track A · FRONTEND-ARCHITECTURE.md §3.3, §6
 *
 * Returns: { isDark, toggleTheme }
 *
 * Behaviour:
 *   - initial state READS the class already set by the boot script in
 *     index.html (document.documentElement.classList.contains('dark')).
 *     Do not re-derive it from localStorage here — that reintroduces the flash.
 *   - toggleTheme: flip isDark, write localStorage['probeai-theme'] = 'dark'|'light',
 *     add/remove the 'dark' class on document.documentElement.
 *
 * Done when: reload preserves the choice, and a dark-mode load never flashes light.
 *
 * TODO(track-a): implement.
 */
