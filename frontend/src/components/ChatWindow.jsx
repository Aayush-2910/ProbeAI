/**
 * ChatWindow — scrollable message area.
 * Track F · FRONTEND-ARCHITECTURE.md §6, §9
 *
 * Props: { messages, isLoading, isDone, feedback, onRetry, onReset }
 *
 * - Scroll container with .chat-scrollbar; inner column max-w-chat (800px), centered.
 * - Renders MessageBubble per message, then TypingIndicator when isLoading,
 *   then FeedbackCard when isDone && feedback.
 * - Auto-scroll: useEffect on [messages.length, isLoading, isDone] scrolling a
 *   bottom sentinel ref with behavior:'smooth'. Must also fire when the typing
 *   indicator appears (§6).
 * - Sender grouping: 4px gap when message.role === previous.role, else 16px.
 *   Pass isGrouped to MessageBubble so it can hide the repeated avatar.
 * - role="log" aria-live="polite" so new interviewer messages are announced.
 *
 * TODO(track-f): implement.
 */
