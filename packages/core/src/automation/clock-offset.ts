import { combineConfidence, confidenceFromMargin } from './confidence.ts'
import { distanceKm, type GeoPoint } from './geo.ts'

/** One shot of a known device; `time` is the instant in epoch milliseconds. */
export interface ClockOffsetSample {
  deviceId: string
  id: string
  point: GeoPoint | null
  time: number
}

export interface ClockOffsetOptions {
  /** Pairs further apart in time than this are not the same moment (s). */
  maxPairSeconds?: number
  /** ... or in space (m). */
  maxPairMeters?: number
  minPairs?: number
  /** Share of pairs that must agree with the median. */
  minAgreement?: number
  /** Pairs within this many seconds of the median agree with it. */
  agreeToleranceSeconds?: number
  /** Smaller offsets are not worth a suggestion (s). */
  minOffsetSeconds?: number
}

export interface ClockOffsetSuggestion {
  /** The device whose clock is suggested to be shifted (the one with fewer shots). */
  deviceId: string
  /** The device it was compared with. */
  referenceDeviceId: string
  /** Seconds to ADD to the capture time of `deviceId`. A suggestion only. */
  offsetSeconds: number
  pairs: number
  /** Share of pairs agreeing with the median, 0-1. */
  agreement: number
  confidence: number
  code: 'TIME_SKEW_CORRECTED'
}

const DEFAULTS = {
  agreeToleranceSeconds: 10,
  maxPairMeters: 100,
  maxPairSeconds: 120,
  minAgreement: 0.8,
  minOffsetSeconds: 30,
  minPairs: 5,
} as const

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2)
  const high = sorted[mid] ?? 0
  return sorted.length % 2 === 1 ? high : ((sorted[mid - 1] ?? high) + high) / 2
}

/**
 * Suggests a clock correction for a device whose clock runs off the clock of
 * another device of the same trip (spec: algorithm, sec. 4, step 4). Pairs are
 * shots of different devices at most 120 s and 100 m apart; with at least 5 pairs
 * of which 80 % agree on the difference, the median is suggested when it is over
 * 30 s. It is ONLY a suggestion: nothing is applied, the author decides.
 * Deterministic; result sorted by device ids.
 */
export function suggestClockOffsets(
  samples: readonly ClockOffsetSample[],
  options: ClockOffsetOptions = {},
): ClockOffsetSuggestion[] {
  const cfg = { ...DEFAULTS, ...options }
  const byDevice = new Map<string, ClockOffsetSample[]>()
  for (const sample of samples) {
    if (!Number.isFinite(sample.time) || sample.point === null) continue
    const list = byDevice.get(sample.deviceId)
    if (list === undefined) byDevice.set(sample.deviceId, [sample])
    else list.push(sample)
  }
  const devices = [...byDevice.keys()].sort()
  for (const list of byDevice.values()) {
    list.sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1))
  }
  const windowMs = cfg.maxPairSeconds * 1000
  const out: ClockOffsetSuggestion[] = []
  for (const [index, first] of devices.entries()) {
    for (const second of devices.slice(index + 1)) {
      const a = byDevice.get(first) ?? []
      const b = byDevice.get(second) ?? []
      // diff = time of `second` minus time of `first` for the same moment.
      const diffs: number[] = []
      let from = 0
      for (const item of a) {
        while (from < b.length && (b[from]?.time ?? 0) < item.time - windowMs) {
          from += 1
        }
        let best: ClockOffsetSample | null = null
        for (let k = from; k < b.length; k += 1) {
          const other = b[k]
          if (other === undefined || other.time > item.time + windowMs) break
          if (
            item.point !== null &&
            other.point !== null &&
            distanceKm(item.point, other.point) * 1000 <= cfg.maxPairMeters &&
            (best === null ||
              Math.abs(other.time - item.time) <
                Math.abs(best.time - item.time))
          ) {
            best = other
          }
        }
        if (best !== null) diffs.push((best.time - item.time) / 1000)
      }
      if (diffs.length < cfg.minPairs) continue
      const sorted = [...diffs].sort((x, y) => x - y)
      const mid = median(sorted)
      const agreeing = sorted.filter(
        (d) => Math.abs(d - mid) <= cfg.agreeToleranceSeconds,
      ).length
      const agreement = agreeing / sorted.length
      if (
        agreement < cfg.minAgreement ||
        Math.abs(mid) <= cfg.minOffsetSeconds
      ) {
        continue
      }
      // Shift the device with fewer shots (ties: the later id) toward the other.
      const shiftSecond = b.length < a.length || b.length === a.length
      const offset = Math.round(mid)
      out.push({
        agreement,
        code: 'TIME_SKEW_CORRECTED',
        confidence: combineConfidence(
          confidenceFromMargin(
            agreement,
            cfg.minAgreement,
            1 - cfg.minAgreement,
          ),
          confidenceFromMargin(sorted.length, cfg.minPairs, cfg.minPairs * 3),
          confidenceFromMargin(Math.abs(mid), cfg.minOffsetSeconds, 120),
        ),
        deviceId: shiftSecond ? second : first,
        offsetSeconds: shiftSecond ? -offset : offset,
        pairs: sorted.length,
        referenceDeviceId: shiftSecond ? first : second,
      })
    }
  }
  return out
}
