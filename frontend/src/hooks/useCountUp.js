/**
 * useCountUp — animates from 0 to `target` once `active` flips true.
 * Driven by requestAnimationFrame + performance.now() (frame timing, not a
 * timestamp snapshot), so it's safe to call on every render.
 */

import { useEffect, useState } from 'react'

export function useCountUp(target, active, duration = 1200) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active) return undefined

    let frame
    const start = performance.now()

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) ** 3 // ease-out cubic
      setValue(target * eased)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, target, duration])

  return value
}
