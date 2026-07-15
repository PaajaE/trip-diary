import { describe, expect, it } from 'vitest'
import {
  computeSourceContentHash,
  type EntryTranslation,
} from '@trip-diary/translation'
import {
  ENTRY_TRANSLATION_POLL_INTERVAL_MS,
  shouldPollEntryTranslation,
} from '@/entities/translation/lib/entry-translation-polling'

const baseTranslation: EntryTranslation = {
  completed_at: null,
  created_at: '2026-07-10T11:00:00.000+00:00',
  edited_at: null,
  entry_id: '550e8400-e29b-41d4-a716-446655440000',
  error_message: null,
  id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  is_manually_edited: false,
  model: null,
  provider: null,
  requested_at: '2026-07-10T11:00:00.000+00:00',
  source_content_hash: computeSourceContentHash('Praha', 'Body'),
  source_locale: 'cs',
  source_version: 1,
  status: 'pending',
  target_locale: 'en',
  translated_body: '',
  translated_title: null,
  updated_at: '2026-07-10T11:00:00.000+00:00',
}

describe('entry translation polling', () => {
  it('uses a three second poll interval constant', () => {
    expect(ENTRY_TRANSLATION_POLL_INTERVAL_MS).toBe(3000)
  })

  it('polls while status is pending or processing', () => {
    expect(shouldPollEntryTranslation({ ...baseTranslation, status: 'pending' })).toBe(
      true,
    )
    expect(
      shouldPollEntryTranslation({ ...baseTranslation, status: 'processing' }),
    ).toBe(true)
  })

  it('does not poll for terminal or absent translations', () => {
    expect(shouldPollEntryTranslation(null)).toBe(false)
    expect(shouldPollEntryTranslation(undefined)).toBe(false)
    expect(
      shouldPollEntryTranslation({ ...baseTranslation, status: 'succeeded' }),
    ).toBe(false)
    expect(
      shouldPollEntryTranslation({ ...baseTranslation, status: 'failed' }),
    ).toBe(false)
    expect(
      shouldPollEntryTranslation({ ...baseTranslation, status: 'stale' }),
    ).toBe(false)
  })
})
