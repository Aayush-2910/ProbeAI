/**
 * InterviewView — the chat screen (during and after the interview).
 * Track F · FRONTEND-ARCHITECTURE.md §6
 *
 * Props: { messages, isLoading, isDone, feedback, error,
 *          onSend, onRetry, onReset, onDismissError }
 *
 * Layout: ChatWindow flex-1 (scrolls) + footer.
 *   footer = isDone ? nothing (FeedbackCard lives in ChatWindow and carries
 *                     "Start New Interview")
 *                   : <ChatInput onSend disabled={isLoading} autoFocusKey={messages.length} />
 *
 * When the interview ends the input is UNMOUNTED, not merely disabled (§6).
 * Error banner sits above the input, dismissible and non-blocking (§7).
 *
 * TODO(track-f): implement.
 */
