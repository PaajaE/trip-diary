import type { GoldenSet } from './golden.ts'

/**
 * Synthetic golden sets: invented places and times, labelled by the rules
 * the algorithm is meant to follow. They cover known weak spots, so a MISS
 * here is information, not a broken build. Real data stays out of the repo.
 */

type Media = GoldenSet['media'][number]

const MDT_OFFSET_HOURS = -6

function instant(localDate: string, time: string, offsetHours: number): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  const ms =
    Date.parse(`${localDate}T00:00:00Z`) +
    (hours - offsetHours) * 3_600_000 +
    minutes * 60_000
  return new Date(ms).toISOString()
}

function shot(
  id: string,
  capturedAt: string,
  latitude: number | null,
  longitude: number | null,
): Media {
  return { capturedAt, id, latitude, longitude }
}

/** Day boundary: the author's "day" ends when they sleep, not at midnight. */
export function afterMidnightSet(): GoldenSet {
  const place = [51.18, -115.57] as const
  const times: [string, string, string][] = [
    ['a1', '2026-06-10', '19:30'],
    ['a2', '2026-06-10', '22:40'],
    // campfire and northern lights: still the evening of the 10th
    ['a3', '2026-06-10', '23:50'],
    ['a4', '2026-06-11', '00:30'],
    ['a5', '2026-06-11', '01:10'],
    // next morning, the real 11th
    ['b1', '2026-06-11', '08:20'],
    ['b2', '2026-06-11', '12:00'],
  ]
  const media = times.map(([id, date, time]) =>
    shot(id, instant(date, time, MDT_OFFSET_HOURS), place[0], place[1]),
  )
  return {
    homeTimeZone: 'America/Edmonton',
    media,
    name: 'syntetická: po půlnoci',
    truth: {
      dayByMediaId: {
        a1: '2026-06-10',
        a2: '2026-06-10',
        a3: '2026-06-10',
        a4: '2026-06-10',
        a5: '2026-06-10',
        b1: '2026-06-11',
        b2: '2026-06-11',
      },
    },
  }
}

/** Day assignment across a zone change (Alberta -> Yukon, no DST in Yukon). */
function zoneChange(): GoldenSet {
  const calgary = [51.05, -114.07] as const
  const whitehorse = [60.72, -135.05] as const
  const media = [
    shot('c1', instant('2026-06-20', '10:00', -6), calgary[0], calgary[1]),
    shot('c2', instant('2026-06-20', '22:30', -6), calgary[0], calgary[1]),
    shot(
      'w1',
      instant('2026-06-21', '07:15', -7),
      whitehorse[0],
      whitehorse[1],
    ),
    shot(
      'w2',
      instant('2026-06-21', '23:45', -7),
      whitehorse[0],
      whitehorse[1],
    ),
  ]
  return {
    homeTimeZone: 'America/Edmonton',
    media,
    name: 'syntetická: změna pásma',
    truth: {
      dayByMediaId: {
        c1: '2026-06-20',
        c2: '2026-06-20',
        w1: '2026-06-21',
        w2: '2026-06-21',
      },
    },
  }
}

/** Three stays far apart, five days each; two stage starts expected. */
function threeStays(): GoldenSet {
  const bases = [
    { lat: 51.05, lon: -114.07, start: 1 },
    { lat: 52.88, lon: -118.08, start: 6 },
    { lat: 49.28, lon: -123.12, start: 11 },
  ]
  const media: Media[] = []
  const dayByMediaId: Record<string, string> = {}
  for (const base of bases) {
    for (let day = 0; day < 5; day += 1) {
      const date = `2026-07-${String(base.start + day).padStart(2, '0')}`
      for (let n = 0; n < 4; n += 1) {
        const id = `s${String(base.start)}-${String(day)}-${String(n)}`
        const jitter = (day * 4 + n) * 0.002
        media.push(
          shot(
            id,
            instant(
              date,
              `${String(9 + n * 3).padStart(2, '0')}:00`,
              MDT_OFFSET_HOURS,
            ),
            base.lat + jitter,
            base.lon + jitter,
          ),
        )
        dayByMediaId[id] = date
      }
    }
  }
  return {
    homeTimeZone: 'America/Edmonton',
    media,
    name: 'syntetická: tři pobyty',
    truth: { dayByMediaId, stageStarts: ['2026-07-06', '2026-07-11'] },
  }
}

/** Same shot twice (re-import) next to look-alike but different shots. */
function duplicates(): GoldenSet {
  const place = [51.18, -115.57] as const
  const t = (time: string): string =>
    instant('2026-06-12', time, MDT_OFFSET_HOURS)
  const media = [
    shot('d1', t('10:00'), place[0], place[1]),
    shot('d1-copy', t('10:00'), place[0], place[1]),
    shot('d2', t('10:05'), place[0], place[1]),
    shot('d3', t('10:30'), place[0], place[1]),
    shot('d3-copy', t('10:30'), place[0] + 0.00002, place[1]),
  ]
  return {
    homeTimeZone: 'America/Edmonton',
    media,
    name: 'syntetická: duplicity',
    truth: {
      duplicateGroups: [
        ['d1', 'd1-copy'],
        ['d3', 'd3-copy'],
      ],
    },
  }
}

/**
 * A batch with a few throw-aways among ordinary photos, plus the look-alikes
 * a careless filter would hide: a starry night sky and a soft but wanted shot.
 */
function junkQueue(): GoldenSet {
  const media: Media[] = []
  const place = [51.18, -115.57] as const
  const t = (n: number): string =>
    instant(
      '2026-06-13',
      `${String(8 + Math.floor(n / 6))}:${String((n % 6) * 10).padStart(2, '0')}`,
      MDT_OFFSET_HOURS,
    )
  type Extra = Partial<Media> & { id: string }
  const add = (extra: Extra, n: number): void => {
    media.push({
      capturedAt: t(n),
      height: 3000,
      kind: 'photo',
      latitude: place[0],
      longitude: place[1],
      quality: { exposure: 0.45, sharp: 90, v: 1 },
      starred: false,
      width: 4000,
      ...extra,
    })
  }
  for (let i = 0; i < 30; i += 1) {
    add(
      {
        id: `ok${String(i)}`,
        quality: { exposure: 0.45, sharp: 80 + i, v: 1 },
      },
      i,
    )
  }
  add({ id: 'black', quality: { exposure: 0.01, sharp: 0.2, v: 1 } }, 30)
  add({ id: 'pocket', quality: { exposure: 0.1, sharp: 2, v: 1 } }, 31)
  add(
    { id: 'chat', height: 320, latitude: null, longitude: null, width: 480 },
    32,
  )
  add({ id: 'screenshot', screenshot: true }, 33)
  // Wanted, but look like junk to a careless rule.
  add({ id: 'stars', quality: { exposure: 0.02, sharp: 40, v: 1 } }, 34)
  add({ id: 'soft-wanted', quality: { exposure: 0.5, sharp: 3, v: 1 } }, 35)
  add(
    {
      id: 'fav-dark',
      quality: { exposure: 0.01, sharp: 0, v: 1 },
      starred: true,
    },
    36,
  )
  return {
    homeTimeZone: 'America/Edmonton',
    media,
    name: 'syntetická: fronta odpadu',
    truth: { junkIds: ['black', 'pocket', 'chat', 'screenshot'] },
  }
}

export function syntheticGoldenSets(): GoldenSet[] {
  return [
    afterMidnightSet(),
    zoneChange(),
    threeStays(),
    duplicates(),
    junkQueue(),
  ]
}
