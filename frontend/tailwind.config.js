// FRONTEND-ARCHITECTURE.md §3.1 — semantic tokens only.
// Components write bg-surface / text-muted, never bg-[#1A2420] dark:bg-[#F0F2EC].
//
// Open decision (§14.1): these are plain var() colors, so Tailwind opacity
// modifiers (bg-accent/20) do NOT work. If the team needs them, switch every
// variable to channel triplets and map as rgb(var(--x) / <alpha-value>).
// Decide before any component is styled.

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        elevated: 'var(--elevated)',
        accent: 'var(--accent)',
        border: 'var(--border)',
        text: {
          DEFAULT: 'var(--text)',
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
          focus: 'var(--input-focus)',
        },
        btn: {
          bg: 'var(--btn-bg)',
          text: 'var(--btn-text)',
          hover: 'var(--btn-hover)',
        },
        warn: 'var(--warn)',
        danger: 'var(--danger)',
      },
      maxWidth: {
        chat: '800px',
      },
    },
  },
  plugins: [],
}
