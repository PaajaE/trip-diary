import type {
  PublicJourney,
  PublicMedia,
} from '@trip-diary/core/public-journey'

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

export const FIXTURE_IDS = {
  hiddenMoment: id(31),
  media1: id(41),
  media2: id(42),
  momentA: id(30),
  momentB: id(32),
  stage: id(10),
  stage2: id(11),
  trip: id(20),
} as const

function photo(
  mediaId: string,
  momentId: string | null,
  extra: Partial<PublicMedia> = {},
): PublicMedia {
  return {
    capturedAt: '2026-06-02T10:00:00+00:00',
    // 04:00 in Edmonton: the first minute of the day (04:00 day rule)
    capturedTz: 'America/Edmonton',
    caption: 'Lake Magog',
    durationMs: null,
    focalX: null,
    focalY: null,
    height: 1200,
    id: mediaId,
    kind: 'photo',
    latitude: 50.9,
    longitude: -115.6,
    momentId,
    segmentOverrideId: null,
    starred: true,
    variants: [
      {
        height: 150,
        kind: 'thumb',
        mimeType: 'image/webp',
        storageKey: 'k/t.webp',
        width: 200,
      },
      {
        height: 450,
        kind: 'small',
        mimeType: 'image/webp',
        storageKey: 'k/s.webp',
        width: 600,
      },
      {
        height: 900,
        kind: 'medium',
        mimeType: 'image/webp',
        storageKey: 'k/m.webp',
        width: 1200,
      },
      {
        height: 1800,
        kind: 'large',
        mimeType: 'image/webp',
        storageKey: 'k/l.webp',
        width: 2400,
      },
    ],
    width: 1600,
    ...extra,
  }
}

export const publicJourneyFixture: PublicJourney = {
  dayNotes: [{ body: 'Den u jezera.', date: '2026-06-02' }],
  journey: {
    coverMediaId: FIXTURE_IDS.media1,
    endsAt: '2026-06-30',
    homeTz: 'Europe/Prague',
    id: id(1),
    space: { handle: 'ecerovi', name: 'Ečerovi' },
    startsAt: '2026-06-01',
    status: 'completed',
    summary: 'Léto v kanadských Rockies.',
    title: 'Kanada 2026',
  },
  media: [
    photo(FIXTURE_IDS.media1, FIXTURE_IDS.momentA),
    photo(FIXTURE_IDS.media2, FIXTURE_IDS.momentB, {
      caption: 'Video z vrcholu',
      durationMs: 12000,
      kind: 'video',
      starred: false,
      variants: [
        {
          height: 720,
          kind: 'poster',
          mimeType: 'image/jpeg',
          storageKey: 'k/p.jpg',
          width: 1280,
        },
        {
          height: 720,
          kind: 'video',
          mimeType: 'video/mp4',
          storageKey: 'k/v.mp4',
          width: 1280,
        },
      ],
    }),
  ],
  moments: [
    {
      body: 'Dorazili jsme k jezeru.',
      coverMediaId: FIXTURE_IDS.media1,
      endsAt: '2026-06-02T12:00:00+00:00',
      id: FIXTURE_IDS.momentA,
      latitude: 50.9,
      longitude: -115.6,
      placeId: id(50),
      startsAt: '2026-06-02T09:00:00+00:00',
      title: 'Lake Magog',
    },
    {
      body: 'Skrytá poloha.',
      coverMediaId: null,
      endsAt: '2026-06-03T12:00:00+00:00',
      id: FIXTURE_IDS.hiddenMoment,
      latitude: null,
      longitude: null,
      placeId: id(50),
      startsAt: '2026-06-03T13:00:00+00:00',
      title: 'Soukromé místo',
    },
    {
      body: 'Sestup dolů.',
      coverMediaId: null,
      endsAt: '2026-06-04T12:00:00+00:00',
      id: FIXTURE_IDS.momentB,
      latitude: 51.0,
      longitude: -115.5,
      placeId: null,
      startsAt: '2026-06-04T13:00:00+00:00',
      title: null,
    },
  ],
  places: [
    {
      countryCode: 'CA',
      id: id(50),
      latitude: 50.9,
      longitude: -115.6,
      name: 'Assiniboine',
      region: 'Alberta',
    },
  ],
  segments: [
    {
      body: 'Rockies jsou skvělé.',
      coverMediaId: null,
      endsAt: '2026-06-10T23:59:00+00:00',
      id: FIXTURE_IDS.stage,
      kind: 'stage',
      parentId: null,
      position: 0,
      startsAt: '2026-06-01T00:00:00+00:00',
      title: 'Rockies',
      tripType: null,
      tz: 'America/Edmonton',
    },
    {
      body: '',
      coverMediaId: null,
      endsAt: '2026-06-20T23:59:00+00:00',
      id: FIXTURE_IDS.stage2,
      kind: 'stage',
      parentId: null,
      position: 1,
      startsAt: '2026-06-11T00:00:00+00:00',
      title: 'Na sever',
      tripType: null,
      tz: null,
    },
    {
      body: 'Šest dní trekem.',
      coverMediaId: null,
      endsAt: '2026-06-05T23:59:00+00:00',
      id: FIXTURE_IDS.trip,
      kind: 'trip',
      parentId: FIXTURE_IDS.stage,
      position: 0,
      startsAt: '2026-06-02T00:00:00+00:00',
      title: 'Assiniboine trek',
      tripType: 'trek',
      tz: 'America/Edmonton',
    },
  ],
  tracks: [
    {
      ascentM: 850,
      distanceM: 24500,
      geojson: {
        coordinates: [
          [-115.6, 50.9],
          [-115.5, 51.0],
        ],
        type: 'LineString',
      },
      id: id(60),
      segmentId: FIXTURE_IDS.trip,
      source: 'gpx',
    },
  ],
}
