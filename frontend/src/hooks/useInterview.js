/**
 * useInterview — THE BRAIN. Single source of truth for the interview.
 * FRONTEND-ARCHITECTURE.md §4, §5, §6
 *
 * Instantiated exactly ONCE, in App. Everything else receives props.
 */

import { useCallback, useRef, useState } from 'react'

import * as api from '../utils/api'
import { createMessageId, createSessionId } from '../utils/helpers'

function makeMessage(role, content) {
  return {
    id: createMessageId(),
    role,
    content,
    timestamp: new Date().toISOString(),
    status: 'sent',
  }
}

function describeError(error) {
  switch (error?.kind) {
    case 'session-expired':
      return { kind: error.kind, message: 'This interview session expired. Start a new interview to continue.' }
    case 'llm-unavailable':
      return { kind: error.kind, message: 'The interviewer is unavailable right now. Give it a moment and retry.' }
    case 'network':
      // The API layer already produced a specific message here — either the
      // proxy's "backend not reachable" detail or the fetch-failure text.
      return {
        kind: error.kind,
        message: error.message || 'Could not reach the server. Check that the backend is running.',
      }
    default:
      return { kind: error?.kind ?? 'unknown', message: 'Something went wrong. Please try again.' }
  }
}

export function useInterview() {
  const [sessionId, setSessionId] = useState(null)
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [error, setError] = useState(null)

  // State updates are async, so a rapid double-submit can slip past an
  // isLoading check. The ref closes that window. §6
  const inFlight = useRef(false)

  const dismissError = useCallback(() => setError(null), [])

  const startInterview = useCallback(
    async (candidate) => {
      if (inFlight.current || sessionId || !candidate) return
      inFlight.current = true

      const id = createSessionId()
      setSessionId(id) // flips to the chat view immediately, so the typing
      setSelectedCandidate(candidate) // indicator covers the opening latency
      setMessages([])
      setIsLoading(true)
      setError(null)

      try {
        const response = await api.startInterview(id, candidate)
        setMessages([makeMessage('interviewer', response.reply)])
      } catch (caught) {
        // Failed start: drop back to the landing view with the error showing.
        setSessionId(null)
        setSelectedCandidate(null)
        setError(describeError(caught))
      } finally {
        setIsLoading(false)
        inFlight.current = false
      }
    },
    [sessionId],
  )

  /** Shared by sendMessage and retryLast — never appends a candidate bubble. */
  const deliver = useCallback(
    async (messageId, text) => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await api.sendMessage(sessionId, text)

        setMessages((previous) => [
          ...previous.map((m) => (m.id === messageId ? { ...m, status: 'sent' } : m)),
          makeMessage('interviewer', response.reply),
        ])

        if (response.done) {
          setIsDone(true)
          setFeedback(response.feedback ?? null)
        }
      } catch (caught) {
        setMessages((previous) =>
          previous.map((m) => (m.id === messageId ? { ...m, status: 'failed' } : m)),
        )
        // 409 means the server already closed the interview — resync rather
        // than leaving the input live against a dead session. §7
        if (caught?.kind === 'already-done') setIsDone(true)
        setError(describeError(caught))
      } finally {
        setIsLoading(false)
        inFlight.current = false
      }
    },
    [sessionId],
  )

  const sendMessage = useCallback(
    (text) => {
      const trimmed = (text ?? '').trim()
      if (!trimmed || !sessionId || isDone || isLoading || inFlight.current) return

      inFlight.current = true
      const message = makeMessage('candidate', trimmed)
      setMessages((previous) => [...previous, message]) // optimistic
      deliver(message.id, trimmed)
    },
    [deliver, isDone, isLoading, sessionId],
  )

  const retryLast = useCallback(() => {
    if (isDone || inFlight.current) return

    const failed = [...messages].reverse().find((m) => m.status === 'failed')
    if (!failed) return

    inFlight.current = true
    setMessages((previous) =>
      previous.map((m) => (m.id === failed.id ? { ...m, status: 'sent' } : m)),
    )
    deliver(failed.id, failed.content)
  }, [deliver, isDone, messages])

  const resetInterview = useCallback(() => {
    inFlight.current = false
    setSessionId(null)
    setSelectedCandidate(null)
    setMessages([])
    setIsLoading(false)
    setIsDone(false)
    setFeedback(null)
    setError(null)
  }, [])

  return {
    sessionId,
    selectedCandidate,
    messages,
    isLoading,
    isDone,
    feedback,
    error,
    startInterview,
    sendMessage,
    retryLast,
    resetInterview,
    dismissError,
  }
}
