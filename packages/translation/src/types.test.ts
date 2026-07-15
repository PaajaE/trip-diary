import { describe, expect, it } from 'vitest'
import {
  TRANSLATION_STATUSES,
  entryTranslationSchema,
  translationRequestSchema,
  translationStatusSchema,
} from './types.ts'

describe('translationStatusSchema', () => {
  it('accepts all translation status values', () => {
    for (const status of TRANSLATION_STATUSES) {
      expect(translationStatusSchema.safeParse(status).success).toBe(true)
    }
  })

  it('rejects unknown status values', () => {
    expect(translationStatusSchema.safeParse('edited').success).toBe(false)
  })
})

describe('entryTranslationSchema', () => {
  const entryId = '550e8400-e29b-41d4-a716-446655440000'
  const translationId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

  const validTranslation = {
    completed_at: '2026-07-10T12:00:00.000+00:00',
    created_at: '2026-07-10T11:00:00.000+00:00',
    edited_at: null,
    entry_id: entryId,
    error_message: null,
    id: translationId,
    is_manually_edited: false,
    model: 'gpt-4.1-mini',
    provider: 'openai',
    requested_at: '2026-07-10T11:00:00.000+00:00',
    source_content_hash: 'abc123',
    source_locale: 'cs' as const,
    source_version: 3,
    status: 'succeeded',
    target_locale: 'en' as const,
    translated_body: 'Translated body text.',
    translated_title: 'Translated title',
    updated_at: '2026-07-10T12:00:00.000+00:00',
  }

  it('accepts a complete entry translation row', () => {
    expect(entryTranslationSchema.safeParse(validTranslation).success).toBe(
      true,
    )
  })

  it('accepts PostgreSQL timestamps with an explicit offset', () => {
    const result = entryTranslationSchema.safeParse({
      ...validTranslation,
      completed_at: '2026-07-10T12:00:00.569114+00:00',
      created_at: '2026-07-10T11:00:00.569114+00:00',
      requested_at: '2026-07-10T11:00:00.569114+00:00',
      updated_at: '2026-07-10T12:00:00.569114+00:00',
    })

    expect(result.success).toBe(true)
  })

  it('rejects translated bodies over 50,000 characters', () => {
    const result = entryTranslationSchema.safeParse({
      ...validTranslation,
      translated_body: 'x'.repeat(50_001),
    })

    expect(result.success).toBe(false)
  })

  it('rejects invalid locale values', () => {
    const result = entryTranslationSchema.safeParse({
      ...validTranslation,
      target_locale: 'de',
    })

    expect(result.success).toBe(false)
  })
})

describe('translationRequestSchema', () => {
  it('accepts a minimal translation request', () => {
    const result = translationRequestSchema.safeParse({
      entry_id: '550e8400-e29b-41d4-a716-446655440000',
      target_locale: 'en',
    })

    expect(result.success).toBe(true)
  })

  it('accepts force regeneration flag', () => {
    const result = translationRequestSchema.safeParse({
      entry_id: '550e8400-e29b-41d4-a716-446655440000',
      force: true,
      target_locale: 'en',
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid entry ids', () => {
    const result = translationRequestSchema.safeParse({
      entry_id: 'not-a-uuid',
      target_locale: 'en',
    })

    expect(result.success).toBe(false)
  })
})
