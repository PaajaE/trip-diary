import { z } from 'zod'

const instantSchema = z.iso.datetime({ offset: true })

export const TITLE_MAX_LENGTH = 160
export const BODY_MAX_LENGTH = 100_000

export const tipVisibilitySchema = z.enum(['private', 'public'])
export type TipVisibility = z.infer<typeof tipVisibilitySchema>

/** A tip (`posts` with kind tip): advice that need not belong to any journey. */
export const tipSchema = z.object({
  authorId: z.uuid(),
  body: z.string(),
  createdAt: instantSchema,
  id: z.uuid(),
  journeyId: z.uuid().nullable(),
  publishedAt: instantSchema.nullable(),
  slug: z.string().nullable(),
  spaceId: z.uuid(),
  title: z.string().min(1).max(TITLE_MAX_LENGTH),
  updatedAt: instantSchema,
  visibility: tipVisibilitySchema,
})
export type Tip = z.infer<typeof tipSchema>

/** What the editor submits; already normalized by `normalizeTipInput`. */
export interface TipInput {
  body: string
  title: string
  visibility: TipVisibility
}

export type TipInputError =
  | 'title_required'
  | 'title_too_long'
  | 'body_too_long'

export function normalizeTipInput(
  raw: TipInput,
): { ok: true; value: TipInput } | { ok: false; reason: TipInputError } {
  const title = raw.title.replace(/\s+/g, ' ').trim()
  if (title === '') return { ok: false, reason: 'title_required' }
  if (Array.from(title).length > TITLE_MAX_LENGTH) {
    return { ok: false, reason: 'title_too_long' }
  }
  const body = raw.body.replace(/\r\n?/g, '\n').trim()
  if (Array.from(body).length > BODY_MAX_LENGTH) {
    return { ok: false, reason: 'body_too_long' }
  }
  return { ok: true, value: { body, title, visibility: raw.visibility } }
}

export type TipErrorCode =
  | 'create_failed'
  | 'delete_failed'
  | 'forbidden'
  | 'invalid_input'
  | 'invalid_row'
  | 'list_failed'
  | 'not_found'
  | 'update_failed'

export class TipError extends Error {
  readonly code: TipErrorCode

  constructor(code: TipErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'TipError'
    this.code = code
  }
}
