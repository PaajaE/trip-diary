export type JourneyCoverErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'read_failed'
  | 'update_failed'

/** Typed failure surfaced by the journey cover repository. */
export class JourneyCoverError extends Error {
  readonly code: JourneyCoverErrorCode

  constructor(code: JourneyCoverErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'JourneyCoverError'
    this.code = code
  }
}
