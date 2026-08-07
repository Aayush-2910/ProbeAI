/**
 * Layout — full page shell with the dot-grid field.
 */

export default function Layout({ header, children }) {
  return (
    // h-dvh (not min-h-screen): the chat scrolls inside <main>, so the shell
    // must be exactly viewport-height. dvh survives mobile browser chrome.
    <div className="grid-bg flex h-dvh flex-col bg-bg text-text">
      {header}
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
