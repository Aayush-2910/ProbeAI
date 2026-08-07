/**
 * FeedbackCard — the closing assessment.
 * Track F · FRONTEND-ARCHITECTURE.md §6, §8
 *
 * Props: { feedback, onReset }
 *   feedback = { summary, strengths[], gaps[], next[] }   // backend contract §3
 *
 * - Appears at the bottom of the chat once done === true; .feedback-enter (500ms).
 * - Wider than a bubble: full chat column. Elevated surface, accent left/top border.
 *
 * Sections:
 *   Title            "Interview Complete" + small ProbeAI accent
 *   Summary          emphasized, full width
 *   Strengths        accent check markers
 *   Areas for Improvement   amber (--warn) markers
 *                    NEVER labelled "Gaps" in the UI — softer language, same data
 *   Recommended Next Steps  arrow markers
 *   Footer           "Start New Interview" -> onReset()
 *
 * Empty arrays render nothing — no orphaned section headers.
 *
 * TODO(track-f): implement.
 */
