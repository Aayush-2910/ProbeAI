/**
 * App — root component. The only place interview and theme state exist.
 * FRONTEND-ARCHITECTURE.md §4, §5
 */

import Header from './components/Header'
import InterviewView from './components/InterviewView'
import LandingView from './components/LandingView'
import Layout from './components/Layout'
import { useInterview } from './hooks/useInterview'
import { useTheme } from './hooks/useTheme'

export default function App() {
  const { isDark, toggleTheme } = useTheme()
  const {
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
  } = useInterview()

  // Derived, never stored. §4
  const isInterviewing = Boolean(sessionId)

  return (
    <Layout
      header={
        <Header
          candidate={isInterviewing ? selectedCandidate : null}
          isDark={isDark}
          toggleTheme={toggleTheme}
        />
      }
    >
      {isInterviewing ? (
        <InterviewView
          messages={messages}
          isLoading={isLoading}
          isDone={isDone}
          feedback={feedback}
          error={error}
          onSend={sendMessage}
          onRetry={retryLast}
          onReset={resetInterview}
          onDismissError={dismissError}
        />
      ) : (
        <LandingView
          onStart={startInterview}
          isLoading={isLoading}
          error={error}
          onDismissError={dismissError}
        />
      )}
    </Layout>
  )
}
