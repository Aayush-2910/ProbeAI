/**
 * ChatInput — sticky answer box.
 * Track F · FRONTEND-ARCHITECTURE.md §6, §9
 *
 * Props: { onSend, disabled, autoFocusKey }
 *
 * - Draft text stays LOCAL (§4). Lifting it re-renders the tree per keystroke.
 * - Auto-growing textarea, max 4 rows then scroll. Placeholder "Type your answer…".
 * - Keys: Enter sends · Shift+Enter newline · Escape blurs. Local handlers only,
 *   no global listeners.
 * - Send button: inline arrow SVG, bg-btn-bg/text-btn-text, active:scale-95,
 *   disabled when the draft is empty or `disabled` is true.
 * - Clear the draft only after onSend has been invoked.
 * - Sticky bottom, 60-70px, 1px top border, page background.
 *
 * Focus rule (§6) — this is where the two hard constraints collide:
 *   re-focus when autoFocusKey changes (App passes messages.length), which lands
 *   AFTER isLoading flips false. Focusing earlier targets a disabled element.
 *   Skip autofocus below md so the mobile keyboard doesn't ambush the user.
 *
 * TODO(track-f): implement.
 */
