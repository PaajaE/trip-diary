import { suggestClockOffsets, type ClockOffsetSample } from '../clock-offset.ts'
import { confidenceBand } from '../confidence.ts'
import { classifyDayType, type DayType } from '../day-type.ts'
import { createNightDayResolver } from '../night-days.ts'
import { afterMidnightSet } from './synthetic.ts'

/** Pass count of one scenario family of the wave-2 functions. */
export interface FunctionScore {
  name: string
  passed: number
  total: number
}

const BASE = { latitude: 51.18, longitude: -115.57 }
const north = (km: number) => ({
  latitude: BASE.latitude + km / 111,
  longitude: BASE.longitude,
})
const at = (km: number, minutes = 30) => ({ minutes, point: north(km) })

function dayTypeScenarios(): FunctionScore {
  const cases: [DayType, ReturnType<typeof classifyDayType>][] = [
    [
      'transfer',
      classifyDayType({
        baseEnd: north(300),
        baseStart: BASE,
        stops: [at(10), at(300)],
      }),
    ],
    [
      'trip',
      classifyDayType({
        baseEnd: BASE,
        baseStart: BASE,
        stops: [at(1), at(35), at(36), at(1)],
      }),
    ],
    [
      'trip',
      classifyDayType({
        baseEnd: BASE,
        baseStart: BASE,
        onFoot: true,
        stops: [at(0.5), at(8)],
      }),
    ],
    [
      'stay',
      classifyDayType({
        baseEnd: BASE,
        baseStart: BASE,
        stops: [at(1, 300), at(3, 120), at(9, 30)],
      }),
    ],
    [
      'city',
      classifyDayType({
        baseEnd: BASE,
        baseStart: BASE,
        stops: [0.2, 0.5, 0.9, 1.3, 1.6, 2, 2.4].map((km) => at(km, 20)),
      }),
    ],
  ]
  return {
    name: 'typ dne',
    passed: cases.filter(([expected, got]) => got.type === expected).length,
    total: cases.length,
  }
}

function clockScenarios(): FunctionScore {
  const base = Date.parse('2026-06-10T10:00:00Z')
  const point = { latitude: 50.08, longitude: 14.42 }
  const pairs = (n: number, skew: (i: number) => number, deviceB = 'B') =>
    Array.from({ length: n }, (_, i): ClockOffsetSample[] => [
      { deviceId: 'A', id: `a${String(i)}`, point, time: base + i * 600_000 },
      {
        deviceId: deviceB,
        id: `b${String(i)}`,
        point,
        time: base + i * 600_000 + skew(i) * 1000,
      },
    ]).flat()
  const cases: [number, number][] = [
    [suggestClockOffsets(pairs(8, () => 95)).length, 1],
    [suggestClockOffsets(pairs(4, () => 95)).length, 0],
    [suggestClockOffsets(pairs(10, (i) => (i < 6 ? 95 : -80))).length, 0],
    [suggestClockOffsets(pairs(8, () => 20)).length, 0],
    [suggestClockOffsets(pairs(8, () => 95, 'A')).length, 0],
  ]
  return {
    name: 'posun hodin (jen návrh)',
    passed: cases.filter(([got, expected]) => got === expected).length,
    total: cases.length,
  }
}

/** Every decision applied automatically (>= 0.85) must be right. */
function autoBandScenario(): FunctionScore {
  const set = afterMidnightSet()
  const zone = set.homeTimeZone
  const resolve = createNightDayResolver(
    set.media.flatMap((m) =>
      m.capturedAt === null ? [] : [{ time: Date.parse(m.capturedAt), zone }],
    ),
  )
  const auto = set.media.flatMap((m) => {
    if (m.capturedAt === null) return []
    const got = resolve(Date.parse(m.capturedAt), zone)
    return confidenceBand(got.confidence) === 'auto'
      ? [got.date === set.truth.dayByMediaId?.[m.id]]
      : []
  })
  return {
    name: 'jistota: automatická pásma bez chyby',
    passed: auto.filter(Boolean).length,
    total: auto.length,
  }
}

export function scoreFunctions(): FunctionScore[] {
  return [dayTypeScenarios(), clockScenarios(), autoBandScenario()]
}

export function formatFunctionScores(scores: readonly FunctionScore[]): string {
  return scores
    .map(
      (s) =>
        `${s.name.padEnd(42)} ${String(s.passed)}/${String(s.total)} ${s.passed === s.total ? 'ok' : 'MISS'}`,
    )
    .join('\n')
}
