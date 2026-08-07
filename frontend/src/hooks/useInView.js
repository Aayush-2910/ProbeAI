/**
 * useInView — true once the ref'd element has scrolled into view, then stays
 * true (the observer disconnects after firing once — this drives an entrance
 * animation, not a visibility toggle).
 */

import { useEffect, useRef, useState } from 'react'

export function useInView(options) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    // jsdom and older browsers have no IntersectionObserver — degrade to
    // "always visible" rather than leaving the section permanently hidden.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2, ...options },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [options])

  return [ref, inView]
}
