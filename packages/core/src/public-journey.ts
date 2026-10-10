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
