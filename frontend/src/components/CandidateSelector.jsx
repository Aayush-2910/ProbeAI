/**
 * CandidateSelector — dropdown + start button. Owns its own data fetch.
 * Track D · FRONTEND-ARCHITECTURE.md §4, §6
 *
 * Props: { onStart, isStarting }
 *
 * Local state: candidates[], selectedId, status: 'loading'|'error'|'ready'
 *   - fetchCandidates() on mount (tolerate StrictMode's double invoke)
 *
 * Dropdown:
 *   - placeholder "Choose a candidate…"
 *   - option label = formatCandidateLabel(c)
 *     -> "Sarah Johnson — Senior Data Engineer (9 years)"
 *   - options come ENTIRELY from the API; names in the build prompt are illustrative
 *
 * Start button:
 *   - disabled + dimmed + no hover when nothing selected or isStarting
 *   - "Starting…" / spinner while isStarting
 *   - onStart(candidate) receives the FULL candidate object, unmodified (§6)
 *
 * Load failure: "Could not load candidates. [Retry]"
 *
 * TODO(track-d): implement.
 */
