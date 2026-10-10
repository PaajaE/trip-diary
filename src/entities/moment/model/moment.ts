import { z } from 'zod'

const instantSchema = z.iso.datetime({ offset: true })

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
  latitude: z.number().min(-90).max(90).nullable(),
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
  latitude?: number | null
  locked?: boolean
  longitude?: number | null
  origin?: MomentOrigin
  placeId?: string | null
  published?: boolean
  startsAt?: string
  title?: string | null
}

export type MomentErrorCode =
  | 'delete_failed'
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
