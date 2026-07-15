import { describe, expect, it } from 'vitest'
import { computeSourceContentHash } from './source-hash.ts'
import { deriveTranslationStatus } from './stale.ts'
import type { EntryTranslation } from './types.ts'

const entryId = '550e8400-e29b-41d4-a716-446655440000'
const translationId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

function createTranslation(
  overrides: Partial<EntryTranslation> = {},
): EntryTranslation {
  return {
    completed_at: '2026-07-10T12:00:00.000+00:00',
    created_at: '2026-07-10T11:00:00.000+00:00',
    edited_at: null,
    entry_id: entryId,
    error_message: null,
    id: translationId,
    is_manually_edited: false,
    model: 'mock-model',
    provider: 'mock',
    requested_at: '2026-07-10T11:00:00.000+00:00',
    source_content_hash: computeSourceContentHash(
      'Original title',
      'Original body',
    ),
    source_locale: 'cs',
    source_version: 2,
    status: 'succeeded',
    target_locale: 'en',
    translated_body: 'Translated body',
    translated_title: 'Translated title',
    updated_at: '2026-07-10T12:00:00.000+00:00',
    ...overrides,
  }
}

const currentEntry = {
  title: 'Original title',
  body: 'Original body',
  version: 2,
}

describe('deriveTranslationStatus', () => {
  it('returns none when translation is missing', () => {
    expect(deriveTranslationStatus(null, currentEntry)).toBe('none')
    expect(deriveTranslationStatus(undefined, currentEntry)).toBe('none')
  })

  it('returns succeeded when hash and version still match', () => {
    expect(deriveTranslationStatus(createTranslation(), currentEntry)).toBe(
      'succeeded',
    )
  })

  it('returns stale when the entry body changed', () => {
    expect(
      deriveTranslationStatus(createTranslation(), {
        ...currentEntry,
        body: 'Updated body',
      }),
    ).toBe('stale')
  })

  it('returns stale when the entry title changed', () => {
    expect(
      deriveTranslationStatus(createTranslation(), {
        ...currentEntry,
        title: 'Updated title',
      }),
    ).toBe('stale')
  })

  it('returns stale when the entry version changed', () => {
    expect(
      deriveTranslationStatus(createTranslation(), {
        ...currentEntry,
        version: 3,
      }),
    ).toBe('stale')
  })

  it('preserves non-succeeded statuses', () => {
    expect(
      deriveTranslationStatus(createTranslation({ status: 'failed' }), {
        ...currentEntry,
        body: 'Updated body',
      }),
    ).toBe('failed')
    expect(
      deriveTranslationStatus(createTranslation({ status: 'processing' }), {
        ...currentEntry,
        body: 'Updated body',
      }),
    ).toBe('processing')
    expect(
      deriveTranslationStatus(
        createTranslation({ status: 'stale' }),
        currentEntry,
      ),
    ).toBe('stale')
  })

  it('does not mark same-locale rows stale from entry drift', () => {
    expect(
      deriveTranslationStatus(
        createTranslation({
          source_locale: 'en',
          target_locale: 'en',
          source_content_hash: 'outdated-hash',
          source_version: 1,
        }),
        { ...currentEntry, body: 'Updated body', version: 5 },
      ),
    ).toBe('succeeded')
  })
})
