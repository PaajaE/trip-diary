import type { PublicJourney } from '@trip-diary/core/public-journey'

/**
 * Synthetic public journey for the reader E2E and screenshots: 5 stages,
 * 19 days, stops with and without titles, day notes, tracks, photos of every
 * shape (portrait, landscape, panorama). Nothing here is real data.
 */

const hex = (n: number) => n.toString(16).padStart(12, '0')
export const atlasId = (kind: number, n: number) =>
  `a${String(kind).padStart(7, '0')}-0000-4000-8000-${hex(n)}`

const STAGES = [
  { days: 3, title: 'Přílet a první kroky' },
  { days: 5, title: 'Louky a hřebeny' },
  { days: 6, title: 'Jezera pod stěnami' },
  { days: 3, title: 'Poslední velký výstup' },
  { days: 2, title: 'Cesta domů' },
] as const

const TITLES = [
  'Lanovka nahoru',
  'Louka pod hřebenem',
  null,
  'Oběd na kameni',
  null,
  'Chata u jezera',
] as const

const SHAPES: [number, number][] = [
  [1600, 1200],
  [1200, 1600],
  [2400, 800],
  [1600, 900],
  [1000, 1000],
  [3000, 900],
  [1200, 1500],
]

const FIRST_DAY = Date.UTC(2025, 6, 20)
const dayIso = (day: number, hour: number) =>
  new Date(FIRST_DAY + day * 86_400_000 + hour * 3_600_000).toISOString()

export const ATLAS = { handle: 'ecerovi', slug: 'dolomity-pesky-2025' } as const

export function buildAtlasJourney(
  opts: { photosPerStop?: number } = {},
): PublicJourney {
  const photosPerStop = opts.photosPerStop ?? 4
  const segments: PublicJourney['segments'] = []
  const moments: PublicJourney['moments'] = []
  const media: PublicJourney['media'] = []
  const tracks: PublicJourney['tracks'] = []
  const dayNotes: PublicJourney['dayNotes'] = []
  let day = 0
  let momentNo = 0
  let mediaNo = 0
  STAGES.forEach((stage, stageIndex) => {
    const id = atlasId(1, stageIndex + 1)
    const startDay = day
    for (let d = 0; d < stage.days; d += 1, day += 1) {
      const date = new Date(FIRST_DAY + day * 86_400_000)
        .toISOString()
        .slice(0, 10)
      if (day % 3 !== 2) {
        dayNotes.push({
          body: `Ráno jsme vyrazili brzy. Den ${String(day + 1)} patřil dlouhému přesunu po hřebeni a bouřce, která přišla odpoledne.\n\nVečer jsme se sešli u chaty.`,
          date,
        })
      }
      for (let s = 0; s < 3; s += 1) {
        momentNo += 1
        const mid = atlasId(3, momentNo)
        const title = TITLES[(momentNo + s) % TITLES.length] ?? null
        moments.push({
          body:
            momentNo % 4 === 0
              ? ''
              : `Zastavili jsme se u jezera. Mlha se před očima trhala a za deset minut stál před námi celý hřeben. Nikdo nemluvil, jen jsme koukali (${String(momentNo)}).`,
          coverMediaId: null,
          endsAt: dayIso(day, 9 + s * 3 + 1),
          id: mid,
          latitude: 46.5 + stageIndex * 0.04 + d * 0.006 + s * 0.002,
          longitude: 11.7 + stageIndex * 0.05 + d * 0.008 + s * 0.003,
          placeId: null,
          startsAt: dayIso(day, 9 + s * 3),
          title,
        })
        for (let p = 0; p < photosPerStop; p += 1) {
          mediaNo += 1
          const [width, height] = SHAPES[mediaNo % SHAPES.length] ?? [
            1600, 1200,
          ]
          const key = `atlas/${String(mediaNo)}`
          media.push({
            capturedAt: dayIso(day, 9 + s * 3 + p * 0.2),
            capturedTz: 'Europe/Rome',
            caption: p === 0 ? 'Výhled za mlhou' : null,
            durationMs: null,
            focalX: null,
            focalY: null,
            height,
            id: atlasId(4, mediaNo),
            kind: 'photo',
            latitude: null,
            longitude: null,
            momentId: mid,
            segmentOverrideId: null,
            starred: p === 0,
            variants: (
              [
                ['thumb', 220],
                ['small', 800],
                ['medium', 1280],
                ['large', 2400],
              ] as const
            ).map(([kind, w]) => ({
              height: Math.round((w * height) / width),
              kind,
              mimeType: 'image/webp' as const,
              storageKey: `${key}/${kind}.webp`,
              width: w,
            })),
            width,
          })
        }
      }
    }
    const lng0 = 11.7 + stageIndex * 0.05
    const lat0 = 46.5 + stageIndex * 0.04
    segments.push({
      body:
        stageIndex === 4
          ? ''
          : `Z údolí lanovkou na louky a první noc v chatě. Ráno mlha, odpoledne ostré slunce. Etapa ${String(stageIndex + 1)} měla pět krátkých úseků.`,
      coverMediaId: null,
      endsAt: dayIso(day - 1, 22),
      id,
      kind: 'stage',
      parentId: null,
      position: stageIndex,
      startsAt: dayIso(startDay, 0),
      title: stage.title,
      tripType: null,
      tz: 'Europe/Rome',
    })
    tracks.push({
      ascentM: 400 + stageIndex * 120,
      distanceM: 8000 + stageIndex * 3000,
      geojson: {
        coordinates: Array.from({ length: 12 }, (_, i) => [
          lng0 + i * 0.004,
          lat0 + Math.sin(i / 2) * 0.01 + i * 0.002,
        ]),
        type: 'LineString',
      },
      id: atlasId(5, stageIndex + 1),
      segmentId: id,
      source: 'gpx',
    })
  })
  return {
    dayNotes,
    journey: {
      coverMediaId: atlasId(4, 1),
      endsAt: '2025-08-07',
      homeTz: 'Europe/Prague',
      id: atlasId(0, 1),
      space: { handle: ATLAS.handle, name: 'Ečerovi' },
      startsAt: '2025-07-20',
      status: 'completed',
      summary: 'Devatenáct dní pěšky po Dolomitech. Mlha, louky a chaty.',
      title: 'Dolomity pěšky, 2025',
    },
    media,
    moments,
    places: [],
    segments,
    tracks,
  }
}
