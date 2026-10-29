import { z } from 'zod'

const instantSchema = z.iso.datetime({ offset: true })

/**
 * What a moment is: a place stayed at, a single-photo point, or photos
 * collapsed while travelling ("en route", one tap promotes a photo to a stop).
 */
export const momentKindSchema = z.enum(['stay', 'point', 'en_route'])
export type MomentKind = z.infer<typeof momentKindSchema>

export const momentOriginSchema = z.enum(['auto', 'manual'])
export type MomentOrigin = z.infer<typeof momentOriginSchema>

/** A cluster of media in time and space; computed automatically or edited by hand. */
export const momentSchema = z.object({
  body: z.string(),
  coverMediaId: z.uuid().nullable(),
  createdAt: instantSchema,
  endsAt: instantSchema,
  id: z.uuid(),
  journeyId: z.uuid(),
  kind: momentKindSchema,
  latitude: z.number().min(-90).max(90).nullable(),
  /**
   * Day of the moment by the author's night, on the clock of where it was
   * shot (stored by the client, see createNightDayResolver); null/absent
   * until stored.
   */
  localDay: z.iso.date().nullable().optional(),
  locked: z.boolean(),
  longitude: z.number().min(-180).max(180).nullable(),
  origin: momentOriginSchema,
  placeId: z.uuid().nullable(),
  published: z.boolean(),
  startsAt: instantSchema,
  title: z.string().min(1).max(160).nullable(),
  updatedAt: instantSchema,
})
export type Moment = z.infer<typeof momentSchema>

/** Only columns granted for UPDATE on public.moments. */
export interface MomentPatch {
  body?: string
  coverMediaId?: string | null
  endsAt?: string
  kind?: MomentKind
  latitude?: number | null
  locked?: boolean
  longitude?: number | null
  origin?: MomentOrigin
  placeId?: string | null
  published?: boolean
  startsAt?: string
  title?: string | null
}

/** Insert shape; only columns granted for INSERT on public.moments. */
export interface NewMoment {
  body?: string
  createdBy: string
  endsAt: string
  id: string
  journeyId: string
  /** Defaults to 'stay' in the database. */
  kind?: MomentKind
  latitude: number | null
  locked?: boolean
  longitude: number | null
  origin?: MomentOrigin
  startsAt: string
  title?: string
}

export const newMomentSchema = z
  .object({
    body: z.string().max(100_000).optional(),
    createdBy: z.uuid(),
    endsAt: instantSchema,
    id: z.uuid(),
    journeyId: z.uuid(),
    kind: momentKindSchema.optional(),
    latitude: z.number().min(-90).max(90).nullable(),
    locked: z.boolean().optional(),
    longitude: z.number().min(-180).max(180).nullable(),
    origin: momentOriginSchema.optional(),
    startsAt: instantSchema,
    title: z.string().min(1).max(160).optional(),
  })
  .refine((value) => (value.latitude === null) === (value.longitude === null), {
    message: 'latitude and longitude come as a pair',
  })
  .refine((value) => Date.parse(value.endsAt) >= Date.parse(value.startsAt), {
    message: 'endsAt must not be before startsAt',
  })

export type MomentErrorCode =
  | 'conflict'
  | 'create_failed'
  | 'delete_failed'
  | 'forbidden'
  | 'invalid_input'
  | 'invalid_row'
  | 'list_failed'
  | 'not_found'
  | 'update_failed'

/** Typed failure surfaced by the moment repository. */
export class MomentError extends Error {
  readonly code: MomentErrorCode

  constructor(code: MomentErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'MomentError'
    this.code = code
  }
}
