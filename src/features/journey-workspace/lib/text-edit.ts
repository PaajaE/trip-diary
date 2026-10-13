export const TITLE_MAX_LENGTH = 160
export const BODY_MAX_LENGTH = 100_000

/** Length in code points, matching Postgres char_length. */
export function codePointLength(value: string): number {
  return Array.from(value).length
}

export type TextError = 'title_required' | 'title_too_long' | 'body_too_long'

export type TitleResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'title_required' | 'title_too_long' }

export type BodyResult =
  | { ok: true; value: string }
  | { ok: false; reason: 'body_too_long' }

/** Segment title: trimmed, required, 1..160 code points. */
export function normalizeSegmentTitle(
  raw: string,
): { ok: true; value: string } | { ok: false; reason: TextError } {
  const value = raw.trim()
  if (value === '') return { ok: false, reason: 'title_required' }
  if (codePointLength(value) > TITLE_MAX_LENGTH) {
    return { ok: false, reason: 'title_too_long' }
  }
  return { ok: true, value }
}

/** Moment title: trimmed; empty becomes null; otherwise 1..160 code points. */
export function normalizeMomentTitle(raw: string): TitleResult {
  const value = raw.trim()
  if (value === '') return { ok: true, value: null }
  if (codePointLength(value) > TITLE_MAX_LENGTH) {
    return { ok: false, reason: 'title_too_long' }
  }
  return { ok: true, value }
}

/** Body: trimmed, may be empty, at most 100000 code points. */
export function normalizeBody(raw: string): BodyResult {
  const value = raw.trim()
  if (codePointLength(value) > BODY_MAX_LENGTH) {
    return { ok: false, reason: 'body_too_long' }
  }
  return { ok: true, value }
}
