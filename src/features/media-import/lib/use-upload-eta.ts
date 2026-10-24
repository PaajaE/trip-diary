import { useEffect, useRef, useState } from 'react'
import { estimateMinutesLeft } from '@/features/media-import/model/eta'

/**
 * Minutes left for the running batch, measured in this session only (the
 * stopwatch starts when the queue starts running and resets when it stops).
 * `performance.now()` measures elapsed time here; it is not an event time.
 */
export function useUploadEta(input: {
  finished: number
  remaining: number
  running: boolean
}): number | null {
  const { finished, remaining, running } = input
  const started = useRef<{ at: number; base: number } | null>(null)
  const [minutes, setMinutes] = useState<number | null>(null)
  useEffect(() => {
    if (!running) {
      started.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the stopwatch result when the external queue stops
      setMinutes(null)
      return
    }
    const now = performance.now()
    started.current ??= { at: now, base: finished }
    setMinutes(
      estimateMinutesLeft({
        elapsedMs: now - started.current.at,
        finishedSinceStart: finished - started.current.base,
        remaining,
      }),
    )
  }, [finished, remaining, running])
  return minutes
}
