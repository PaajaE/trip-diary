export const CAPTION_MAX_LENGTH = 2000

export type CaptionResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'too_long' }

/** Trims; empty becomes null; rejects text over the DB limit (2000 chars). */
export function normalizeCaption(raw: string): CaptionResult {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: true, value: null }
  if (Array.from(trimmed).length > CAPTION_MAX_LENGTH) {
    return { ok: false, reason: 'too_long' }
  }
  return { ok: true, value: trimmed }
}
