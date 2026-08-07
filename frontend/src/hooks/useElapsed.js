/**
 * useElapsed — live mm:ss since a start timestamp.
 *
 * Feeds the stats bar. Stops ticking once the interview is done so a finished
 * transcript doesn't keep counting.
 */

import { useEffect, useState } from 'react'

function format(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function useElapsed(startedAt, frozen) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!startedAt || frozen) return undefined
    const update = () => setSeconds(Math.floor((Date.now() - startedAt) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startedAt, frozen])

  return format(seconds)
}
