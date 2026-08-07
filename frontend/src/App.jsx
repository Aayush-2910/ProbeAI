/**
 * App — root component. The ONLY place interview and theme state exist.
 * Track F · FRONTEND-ARCHITECTURE.md §4, §5
 *
 * Owns:
 *   const interview = useInterview()   // exactly one instance, app-wide
 *   const { isDark, toggleTheme } = useTheme()
 *
 * Renders:
 *   <Layout header={<Header candidate={selectedCandidate} isDark toggleTheme />}>
 *     {view === 'landing' ? <LandingView ... /> : <InterviewView ... />}
 *   </Layout>
 *
 * Derived state — compute, never store (§4):
 *   view      = sessionId ? 'interview' : 'landing'
 *
 * Done when:
 *   - switching views does NOT remount Header
 *   - no interview or theme state lives above or beside App
 *
 * TODO(track-f): implement.
 */
