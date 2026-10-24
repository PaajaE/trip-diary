/** Finished jobs needed before an estimate is shown. */
export const ETA_MIN_SAMPLES = 3

/**
 * Whole minutes (at least 1) left, from the mean time per job so far, or null
 * while there are too few samples. All values are elapsed-time measurements,
 * never event times.
 */
export function estimateMinutesLeft(input: {
  elapsedMs: number
  finishedSinceStart: number
  remaining: number
}): number | null {
  if (input.finishedSinceStart < ETA_MIN_SAMPLES || input.remaining <= 0) {
    return null
  }
  const perJob = input.elapsedMs / input.finishedSinceStart
  return Math.max(1, Math.ceil((perJob * input.remaining) / 60_000))
}
