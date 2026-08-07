/**
 * Footer — landing-page only (not rendered during the interview, where the
 * fixed-height chat layout needs the full viewport). Every link here is
 * either a real same-page anchor or the project's actual GitHub remote —
 * nothing is a placeholder pointing nowhere.
 */


const REPO_URL = 'https://github.com/Aayush-2910/ProbeAI'

const NAV_LINKS = [
  { href: '#candidates', label: 'Candidates' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#performance', label: 'AI Performance' },
]

const STACK = ['React', 'Vite', 'Tailwind', 'FastAPI', 'Gemini']
const COHORT = ['20 Candidates', '31-Day Curriculum', '8 Modules']

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.2c0 4.49 2.87 8.3 6.84 9.64.5.1.68-.22.68-.5 0-.24-.01-1.05-.01-1.9-2.78.62-3.37-1.22-3.37-1.22-.46-1.18-1.11-1.5-1.11-1.5-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.34 1.12 2.91.86.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.13-4.56-5.03 0-1.11.38-2.02 1.01-2.73-.1-.26-.44-1.3.1-2.7 0 0 .83-.27 2.72 1.05a9.2 9.2 0 0 1 4.96 0c1.89-1.32 2.72-1.05 2.72-1.05.54 1.4.2 2.44.1 2.7.63.71 1.01 1.62 1.01 2.73 0 3.91-2.34 4.77-4.57 5.02.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .28.18.61.69.5A10.02 10.02 0 0 0 22 12.2C22 6.58 17.52 2 12 2z" />
    </svg>
  )
}

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="w-full border-t border-border">
      <div className="mx-auto grid w-full max-w-shell grid-cols-2 gap-x-8 gap-y-10 px-6 py-14 sm:px-8 lg:grid-cols-4">
        <div className="col-span-2 lg:col-span-1">
          <span className="font-logo text-[15px] font-bold uppercase tracking-[0.28em] text-logo">
            ProbeAI
          </span>
          <p className="mt-3.5 max-w-[240px] text-[13.5px] font-normal leading-relaxed text-text-secondary">
            AI-powered adaptive technical interviews for the 31-day AI Engineering cohort.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="ProbeAI on GitHub"
            className="glow-hover mt-5 inline-flex h-10 w-10 items-center justify-center rounded-lg
                       border border-border text-text-secondary transition-colors
                       hover:border-accent-muted hover:text-accent-strong focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-accent-muted"
          >
            <span className="relative flex">
              <GithubIcon />
            </span>
          </a>
        </div>

        <nav aria-label="Sections">
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-text-muted">
            Navigate
          </h3>
          <ul className="mt-4 flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-[13.5px] font-normal text-text-secondary transition-colors
                             hover:text-accent-strong"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-text-muted">
            Built With
          </h3>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {STACK.map((tech) => (
              <span
                key={tech}
                className="rounded-full border border-border px-2.5 py-1 text-[12px] font-medium text-text-secondary"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-text-muted">
            The Cohort
          </h3>
          <ul className="mt-4 flex flex-col gap-3">
            {COHORT.map((fact) => (
              <li key={fact} className="text-[13.5px] font-normal text-text-secondary">
                {fact}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-shell flex-col items-center gap-2 px-6 py-5
                        text-center sm:flex-row sm:justify-between sm:px-8 sm:text-left">
          <span className="text-[12px] font-normal text-text-muted">© {year} ProbeAI</span>
          <span className="text-[12px] font-normal text-text-muted">
            An AI that doesn&apos;t just ask. It probes.
          </span>
        </div>
      </div>
    </footer>
  )
}
