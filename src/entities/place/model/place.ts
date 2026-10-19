import { z } from 'zod'

/** A named place (Mapy.com reverse geocoding); shown with PlaceAttribution. */
export const placeSchema = z.object({
  countryCode: z.string().nullable(),
  id: z.uuid(),
  latitude: z.number(),
  longitude: z.number(),
  name: z.string(),
  region: z.string().nullable(),
})
export type Place = z.infer<typeof placeSchema>

/** Response of the resolve-place edge function. */
export const resolvePlaceResponseSchema = z.object({
  cached: z.boolean(),
  place: placeSchema.nullable(),
})

export type PlaceErrorCode =
  | 'invalid_response'
  | 'list_failed'
  | 'resolve_failed'

export class PlaceError extends Error {
  readonly code: PlaceErrorCode

  constructor(code: PlaceErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'PlaceError'
    this.code = code
  }
}
