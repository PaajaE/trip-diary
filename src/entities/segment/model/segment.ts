import { z } from 'zod'

/** Instants come from PostgREST as ISO strings with an offset (UTC instant). */
const instantSchema = z.iso.datetime({ offset: true })

export const segmentKindSchema = z.enum(['stage', 'trip'])
export type SegmentKind = z.infer<typeof segmentKindSchema>

export const tripTypeSchema = z.enum(['trek', 'day', 'transfer', 'stay'])
export type TripType = z.infer<typeof tripTypeSchema>

export const segmentOriginSchema = z.enum(['manual', 'suggested', 'accepted'])
export type SegmentOrigin = z.infer<typeof segmentOriginSchema>

/** A stage (weeks/months) or a trip (hours/days, may nest under a stage or trip). */
export const segmentSchema = z.object({
  body: z.string(),
  coverMediaId: z.uuid().nullable(),
  createdAt: instantSchema,
  endsAt: instantSchema,
  id: z.uuid(),
  journeyId: z.uuid(),
  kind: segmentKindSchema,
  origin: segmentOriginSchema,
  parentId: z.uuid().nullable(),
  position: z.number().int().nonnegative(),
  startsAt: instantSchema,
  title: z.string().min(1).max(160),
  tripType: tripTypeSchema.nullable(),
  /** IANA zone of the experience; null falls back to the journey home zone. */
  tz: z.string().min(1).nullable(),
  updatedAt: instantSchema,
})
export type Segment = z.infer<typeof segmentSchema>

export interface NewSegment {
  body?: string
  coverMediaId?: string | null
  createdBy: string
  endsAt: string
  id: string
  journeyId: string
  kind: SegmentKind
  origin?: SegmentOrigin
  parentId?: string | null
  position?: number
  startsAt: string
  title: string
  tripType?: TripType | null
  tz?: string | null
}

/** Only columns granted for UPDATE on public.segments (journey_id is immutable). */
export interface SegmentPatch {
  body?: string
  coverMediaId?: string | null
  endsAt?: string
  kind?: SegmentKind
  origin?: SegmentOrigin
  parentId?: string | null
  position?: number
  startsAt?: string
  title?: string
  tripType?: TripType | null
  tz?: string | null
}

export type SegmentErrorCode =
  | 'create_failed'
  | 'delete_failed'
  | 'invalid_input'
  | 'invalid_row'
  | 'list_failed'
  | 'not_found'
  | 'update_failed'

/** Typed failure surfaced by the segment repository. */
export class SegmentError extends Error {
  readonly code: SegmentErrorCode

  constructor(code: SegmentErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'SegmentError'
    this.code = code
  }
}
