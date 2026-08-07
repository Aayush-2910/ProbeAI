/**
 * useChatDraft — the answer being typed.
 * FRONTEND-ARCHITECTURE.md §4, §6
 *
 * Called INSIDE ChatInput. A hook invoked in the component keeps re-renders as
 * local as useState does, so project rule 7 (state logic lives in hooks) costs
 * nothing here. Lifting the draft to App is what would be expensive.
 */

import { useCallback, useState } from 'react'

export function useChatDraft(onSend, disabled) {
  const [draft, setDraft] = useState('')

  const canSend = draft.trim().length > 0 && !disabled

  const submit = useCallback(() => {
    const text = draft.trim()
    if (!text || disabled) return
    onSend(text)
    setDraft('') // cleared only after onSend has been invoked
  }, [disabled, draft, onSend])

  return { draft, setDraft, canSend, submit }
}
