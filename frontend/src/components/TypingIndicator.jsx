/**
 * TypingIndicator — "ProbeAI is thinking".
 * Track E · FRONTEND-ARCHITECTURE.md §6, §8
 *
 * Props: none
 *
 * - Left-aligned, same bubble treatment as an interviewer message but compact.
 * - Three dots using .typing-dot (staggered 0 / 150 / 300ms via index.css).
 * - Optional muted "ProbeAI is thinking…" label beside the dots.
 * - aria-label="ProbeAI is thinking".
 * - Under prefers-reduced-motion the dots hold static (handled globally in index.css).
 *
 * Shown whenever isLoading is true — turns are LLM-bound and can take several
 * seconds, so this is the primary latency affordance (§1.4).
 *
 * TODO(track-e): implement.
 */
