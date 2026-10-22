import { z } from 'zod'

export const DAY_NOTE_MAX_LENGTH = 20_000

/** Free text of one local calendar day of a journey ("zapis dne"). */
export const dayNoteSchema = z.object({
  body: z.string().min(1).max(DAY_NOTE_MAX_LENGTH),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  journeyId: z.uuid(),
  /** Calendar day "YYYY-MM-DD" in the journey's display zone. */
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updatedAt: z.iso.datetime({ offset: true }),
})
export type DayNote = z.infer<typeof dayNoteSchema>

export type DayNoteErrorCode =
  | 'delete_failed'
  | 'forbidden'
  | 'invalid_input'
  | 'invalid_row'
  | 'list_failed'
  | 'save_failed'

export class DayNoteError extends Error {
  readonly code: DayNoteErrorCode

  constructor(code: DayNoteErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'DayNoteError'
    this.code = code
  }
}
