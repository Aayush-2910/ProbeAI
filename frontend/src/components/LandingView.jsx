/**
 * LandingView — pre-interview screen.
 * Track D · FRONTEND-ARCHITECTURE.md §6
 *
 * Props: { onStart, isLoading, error, onDismissError }
 *
 * Centered column, vertically and horizontally:
 *   - PROBEAI (large) + tagline
 *   - one-line explainer: "Select a candidate to begin a personalized technical
 *     interview based on their AI Cohort learning journey."
 *   - <CandidateSelector onStart={onStart} isStarting={isLoading} />
 *   - dismissible error banner when a start attempt failed
 *
 * No sidebar, no extra elements. Spacious.
 *
 * TODO(track-d): implement.
 */
