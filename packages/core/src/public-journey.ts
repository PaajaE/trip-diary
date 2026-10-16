import { z } from 'zod'

/**
 * v2 public read model returned by the `get_public_journey` RPC
 * (supabase/migrations/20261009120100_v2_public_journey.sql).
 * Mirrors the SQL json shape; keep both in sync.
 */

const isoDateTime = z.iso.datetime({ offset: true })
const isoDate = z.iso.date()
const latitude = z.number().min(-90).max(90)
const longitude = z.number().min(-180).max(180)

export const segmentKindSchema = z.enum(['stage', 'trip'])
export const tripTypeSchema = z.enum(['trek', 'day', 'transfer', 'stay'])
export const mediaKindSchema = z.enum(['photo', 'video'])
export const mediaVariantKindSchema = z.enum([
  'thumb',
  'small',
  'medium',
  'large',
  'video',
  'poster',
])

export const publicMediaVariantSchema = z.object({
  height: z.number().int().positive(),
  kind: mediaVariantKindSchema,
  mimeType: z.enum(['image/webp', 'image/jpeg', 'video/mp4']),
  storageKey: z.string().min(1),
  width: z.number().int().positive(),
})

export const publicMediaSchema = z.object({
  capturedAt: isoDateTime.nullable(),
  capturedTz: z.string().nullable(),
  caption: z.string().nullable(),
  durationMs: z.number().int().positive().nullable(),
  focalX: z.number().min(0).max(1).nullable(),
  focalY: z.number().min(0).max(1).nullable(),
  height: z.number().int().positive().nullable(),
  id: z.uuid(),
  kind: mediaKindSchema,
  latitude: latitude.nullable(),
  longitude: longitude.nullable(),
  momentId: z.uuid().nullable(),
  segmentOverrideId: z.uuid().nullable(),
  starred: z.boolean(),
  variants: z.array(publicMediaVariantSchema),
  width: z.number().int().positive().nullable(),
})

export const publicSegmentSchema = z.object({
  body: z.string(),
  coverMediaId: z.uuid().nullable(),
  endsAt: isoDateTime,
  id: z.uuid(),
  kind: segmentKindSchema,
  parentId: z.uuid().nullable(),
  position: z.number().int().nonnegative(),
  startsAt: isoDateTime,
  title: z.string().min(1),
  tripType: tripTypeSchema.nullable(),
  tz: z.string().nullable(),
})

export const publicMomentSchema = z.object({
  body: z.string(),
  coverMediaId: z.uuid().nullable(),
  endsAt: isoDateTime,
  id: z.uuid(),
  latitude: latitude.nullable(),
  longitude: longitude.nullable(),
  placeId: z.uuid().nullable(),
  startsAt: isoDateTime,
  title: z.string().nullable(),
})

export const publicPlaceSchema = z.object({
  countryCode: z.string().nullable(),
  id: z.uuid(),
  latitude,
  longitude,
  name: z.string().min(1),
  region: z.string().nullable(),
})

export const publicTrackSchema = z.object({
  ascentM: z.number().int().nonnegative().nullable(),
  distanceM: z.number().int().nonnegative().nullable(),
  geojson: z.object({
    coordinates: z.array(z.array(z.number()).min(2)),
    type: z.literal('LineString'),
  }),
  id: z.uuid(),
  segmentId: z.uuid(),
  source: z.enum(['gpx', 'derived']),
})

export const publicJourneySchema = z.object({
  journey: z.object({
    coverMediaId: z.uuid().nullable(),
    endsAt: isoDate.nullable(),
    homeTz: z.string().nullable(),
    id: z.uuid(),
    space: z.object({ handle: z.string().min(1), name: z.string().min(1) }),
    startsAt: isoDate.nullable(),
    status: z.enum(['planning', 'active', 'completed']),
    summary: z.string(),
    title: z.string().min(1),
  }),
  media: z.array(publicMediaSchema),
  moments: z.array(publicMomentSchema),
  places: z.array(publicPlaceSchema),
  segments: z.array(publicSegmentSchema),
  tracks: z.array(publicTrackSchema),
})

export type SegmentKind = z.infer<typeof segmentKindSchema>
export type TripType = z.infer<typeof tripTypeSchema>
export type MediaKind = z.infer<typeof mediaKindSchema>
export type MediaVariantKind = z.infer<typeof mediaVariantKindSchema>
export type PublicMediaVariant = z.infer<typeof publicMediaVariantSchema>
export type PublicMedia = z.infer<typeof publicMediaSchema>
export type PublicSegment = z.infer<typeof publicSegmentSchema>
export type PublicMoment = z.infer<typeof publicMomentSchema>
export type PublicPlace = z.infer<typeof publicPlaceSchema>
export type PublicTrack = z.infer<typeof publicTrackSchema>
export type PublicJourney = z.infer<typeof publicJourneySchema>

/** Parses the RPC result; `null` means the journey is missing or not public. */
export function parsePublicJourney(payload: unknown): PublicJourney | null {
  if (payload === null) {
    return null
  }
  return publicJourneySchema.parse(payload)
}

/**
 * Static preview of the route map (pins and route line), laid out in a
 * `MAP_PREVIEW_WIDTH` x `MAP_PREVIEW_HEIGHT` box the way the real map fits the
 * route. It is drawn before the map library has loaded (prerendered page and
 * React placeholder), so both must come from this one function.
 */
export const MAP_PREVIEW_WIDTH = 372
export const MAP_PREVIEW_HEIGHT = 352
const MAP_PREVIEW_PADDING = 48
const MAP_PREVIEW_MAX_ZOOM = 13
const MAP_PREVIEW_MAX_LINE_POINTS = 80

export interface MapPreviewPoint {
  x: number
  y: number
}

export interface MapPreview {
  /** Dashed connector through the pins (journeys without a recorded track). */
  dashed: boolean
  lines: MapPreviewPoint[][]
  points: MapPreviewPoint[]
}

function mercator(longitude: number, latitude: number): [number, number] {
  const lat = Math.max(-85.0511, Math.min(85.0511, latitude))
  const sin = Math.sin((lat * Math.PI) / 180)
  return [
    (longitude + 180) / 360,
    0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  ]
}

function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const step = (items.length - 1) / (max - 1)
  const keep = new Set(
    Array.from({ length: max }, (_, index) => Math.round(index * step)),
  )
  return items.filter((_, index) => keep.has(index))
}

/** Null when the journey has nothing to draw (no located moments or tracks). */
export function buildMapPreview(tree: PublicJourney): MapPreview | null {
  const pins: [number, number][] = []
  const located = [...tree.moments].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
  )
  for (const m of located) {
    if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
      pins.push(mercator(m.longitude, m.latitude))
    }
  }
  const tracks: [number, number][][] = tree.tracks.map((track) =>
    thin(
      track.geojson.coordinates.flatMap((c) => {
        const [lng, lat] = c
        return lng === undefined || lat === undefined
          ? []
          : [mercator(lng, lat)]
      }),
      MAP_PREVIEW_MAX_LINE_POINTS,
    ),
  )
  const all = [...pins, ...tracks.flat()]
  if (all.length === 0) return null
  const xs = all.map(([x]) => x)
  const ys = all.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const innerW = MAP_PREVIEW_WIDTH - 2 * MAP_PREVIEW_PADDING
  const innerH = MAP_PREVIEW_HEIGHT - 2 * MAP_PREVIEW_PADDING
  const fit = Math.min(
    maxX - minX > 0 ? innerW / (maxX - minX) : Infinity,
    maxY - minY > 0 ? innerH / (maxY - minY) : Infinity,
  )
  const scale = Math.min(fit, 256 * 2 ** MAP_PREVIEW_MAX_ZOOM)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const place = ([x, y]: [number, number]): MapPreviewPoint => ({
    x: Math.round((MAP_PREVIEW_WIDTH / 2 + (x - cx) * scale) * 10) / 10,
    y: Math.round((MAP_PREVIEW_HEIGHT / 2 + (y - cy) * scale) * 10) / 10,
  })
  const lines = tracks.filter((t) => t.length >= 2).map((t) => t.map(place))
  const dashed = lines.length === 0 && pins.length >= 2
  return {
    dashed,
    lines: dashed ? [pins.map(place)] : lines,
    points: pins.map(place),
  }
}

/**
 * Backdrop of the preview: soft relief-like patches in the proportions of a
 * Mapy outdoor render (k-means of the real map of a sample journey), so the
 * box is already close to the map's colour distribution before tiles arrive.
 */
export const MAP_PREVIEW_BACKGROUND = [
  'radial-gradient(60% 55% at 15% 20%,#d0dcc8,transparent)',
  'radial-gradient(55% 50% at 85% 75%,#9db79e,transparent)',
  'radial-gradient(35% 30% at 70% 15%,#f6f9f4,transparent)',
  'radial-gradient(30% 25% at 25% 70%,#829782,transparent)',
  '#b8caac',
].join(',')

/**
 * Inner SVG (no user text, numbers only) of the preview. Scales uniformly into
 * its box (`meet`), the route colour matches the app's primary green.
 */
export function mapPreviewSvg(preview: MapPreview): string {
  const path = (line: MapPreviewPoint[]) =>
    line
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${String(p.x)} ${String(p.y)}`)
      .join('')
  const lines = preview.lines
    .map(
      (line) =>
        `<path d="${path(line)}" fill="none" stroke="#285943" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"${preview.dashed ? ' stroke-dasharray="8 8"' : ''}/>`,
    )
    .join('')
  const pins = preview.points
    .map(
      (p) =>
        `<circle cx="${String(p.x)}" cy="${String(p.y)}" r="16" fill="#f7f4ed" stroke="#285943" stroke-width="3"/>`,
    )
    .join('')
  return `<svg class="h-full w-full" viewBox="0 0 ${String(MAP_PREVIEW_WIDTH)} ${String(MAP_PREVIEW_HEIGHT)}" preserveAspectRatio="xMidYMid meet" focusable="false">${lines}${pins}</svg>`
}
