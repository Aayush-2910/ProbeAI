/**
 * MessageBubble — one message, either side.
 * Track E · FRONTEND-ARCHITECTURE.md §3.2, §6, §8
 *
 * Props: { message, isGrouped, onRetry }
 *   message = { id, role: 'interviewer'|'candidate', content, timestamp, status? }
 *
 * Interviewer (left):
 *   bg-bubble-interviewer, 1px border-border, rounded-2xl rounded-tl-sm,
 *   small circular "P" avatar on the left (hidden when isGrouped)
 *
 * Candidate (right):
 *   bg-bubble-candidate, text-bubble-candidateText, rounded-2xl rounded-tr-sm,
 *   no avatar
 *
 * Both: max-w-[85%], padding 14px 18px, text 15px / line-height 1.7,
 *       whitespace-pre-wrap (line breaks yes, markdown no),
 *       .message-enter on mount
 *
 * status === 'failed': muted/danger-tinted bubble plus inline
 *   "Message failed to send. [Retry]" wired to onRetry.
 *
 * TODO(track-e): implement.
 */
