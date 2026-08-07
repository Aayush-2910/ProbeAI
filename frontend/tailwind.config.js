// Semantic tokens only — see src/index.css for the values.
// Components write bg-surface / text-text-muted, never a hex and never a dark:
// variant. Per-theme differences are resolved in CSS, not in JSX.
//
// Note: these are plain var() colours, so Tailwind opacity modifiers
// (bg-accent/20) do not apply. Translucent cases have their own tokens.

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Kept as a distinct name (not a distinct family) so the wordmark's
        // heavy tracking reads as an intentional lockup, not a body-text slip.
        logo: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        hover: 'var(--hover)',
        accent: {
          DEFAULT: 'var(--accent)',
          strong: 'var(--accent-strong)',
          muted: 'var(--accent-muted)',
        },
        border: 'var(--border)',
        text: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        bubble: {
          interviewer: 'var(--bubble-interviewer)',
          candidate: 'var(--bubble-candidate)',
          candidateText: 'var(--bubble-candidate-text)',
        },
        input: {
          bg: 'var(--input-bg)',
          border: 'var(--input-border)',
        },
        btn: {
          bg: 'var(--btn-bg)',
          text: 'var(--btn-text)',
          hover: 'var(--btn-hover)',
        },
        logo: 'var(--logo)',
        success: 'var(--success)',
        warn: 'var(--warn)',
        info: 'var(--info)',
        danger: 'var(--danger)',
        tintDanger: 'var(--tint-danger)',
        tintSuccess: 'var(--tint-success)',
        track: 'var(--track)',
      },
      maxWidth: {
        chat: '820px',
        shell: '1100px',
      },
    },
  },
  plugins: [],
}
