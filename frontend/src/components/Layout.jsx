/**
 * Layout — full page shell.
 * FRONTEND-ARCHITECTURE.md §6
 */

export default function Layout({ header, children }) {
  return (
    // h-dvh (not min-h-screen): the chat scrolls inside <main>, so the shell
    // must be exactly viewport-height. dvh also survives mobile browser chrome.
    <div className="flex h-dvh flex-col bg-bg text-text">
      {header}
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
