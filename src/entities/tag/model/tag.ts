import { z } from 'zod'

export const tagKindSchema = z.enum(['category', 'free', 'species'])
export type TagKind = z.infer<typeof tagKindSchema>

export const tagSchema = z.object({
  gbifTaxonId: z.number().int().nullable(),
  id: z.uuid(),
  kind: tagKindSchema,
  label: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
})
export type Tag = z.infer<typeof tagSchema>

/** A tag attached to a moment (one row of `taggings`). */
export interface MomentTagging {
  momentId: string
  tagId: string
}

export const LABEL_MAX_LENGTH = 120

export type TagErrorCode =
  | 'create_failed'
  | 'delete_failed'
  | 'forbidden'
  | 'invalid_input'
  | 'invalid_row'
  | 'list_failed'
  | 'lookup_failed'

/** Typed failure surfaced by the tag repository. */
export class TagError extends Error {
  readonly code: TagErrorCode

  constructor(code: TagErrorCode, message?: string, cause?: unknown) {
    super(message ?? code, cause === undefined ? undefined : { cause })
    this.name = 'TagError'
    this.code = code
  }
}

/** Collapses whitespace; null when nothing is left or the label is too long. */
export function normalizeTagLabel(raw: string): string | null {
  const label = raw.replace(/\s+/g, ' ').trim()
  if (label === '' || Array.from(label).length > LABEL_MAX_LENGTH) return null
  return label
}

/**
 * Stable slug for a free tag: lower-case ASCII, diacritics folded, other runs
 * replaced by one dash. Labels with no ASCII letters or digits (for example
 * emoji or Cyrillic) fall back to `u-` plus the code points in hex, so they
 * stay distinct and valid for the slug constraint.
 */
export function slugifyTagLabel(label: string): string {
  const ascii = label
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii !== '') return ascii.slice(0, 80).replace(/-+$/, '')
  const hex = Array.from(label.toLowerCase())
    .map((char) => (char.codePointAt(0) ?? 0).toString(16))
    .join('-')
  return `u-${hex}`.slice(0, 80).replace(/-+$/, '')
}

/** Slug of the tag that represents a GBIF species. */
export function speciesSlug(taxonKey: number): string {
  return `s-${String(taxonKey)}`
}
