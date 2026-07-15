import { describe, expect, it } from 'vitest'
import {
  computeSourceContentHash,
  type EntryTranslation,
  type TranslationStatus,
} from '@trip-diary/translation'
import { resolveEntryTranslationPanelPresentation } from '@/entities/translation/lib/entry-translation-panel-state'

const entryId = '550e8400-e29b-41d4-a716-446655440000'
const entry = {
  body: 'Body text',
  title: 'Praha',
  version: 1,
}

function createTranslation(
  status: TranslationStatus,
  overrides: Partial<EntryTranslation> = {},
): EntryTranslation {
  return {
    completed_at:
      status === 'succeeded' || status === 'stale'
        ? '2026-07-10T12:00:00.000+00:00'
        : null,
    created_at: '2026-07-10T11:00:00.000+00:00',
    edited_at: null,
    entry_id: entryId,
    error_message: status === 'failed' ? 'provider_timeout' : null,
    id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    is_manually_edited: false,
    model: status === 'succeeded' || status === 'stale' ? 'mock-model' : null,
    provider: status === 'succeeded' || status === 'stale' ? 'mock' : null,
    requested_at: '2026-07-10T11:00:00.000+00:00',
    source_content_hash: computeSourceContentHash(entry.title, entry.body),
    source_locale: 'cs',
    source_version: entry.version,
    status,
    target_locale: 'en',
    translated_body:
      status === 'succeeded' || status === 'stale'
        ? 'Translated body text.'
        : '',
    translated_title:
      status === 'succeeded' || status === 'stale' ? 'Translated title' : null,
    updated_at: '2026-07-10T12:00:00.000+00:00',
    ...overrides,
  }
}

describe('resolveEntryTranslationPanelPresentation', () => {
  it('shows translate action when no translation exists', () => {
    expect(
      resolveEntryTranslationPanelPresentation({
        entry,
        isRequestPending: false,
        isSavePending: false,
        translation: null,
      }),
    ).toMatchObject({
      displayStatus: 'none',
      showTranslateAction: true,
      statusMessageKey: 'entry.translation.status.none',
    })
  })

  it('uses requesting state while generation mutation is pending', () => {
    expect(
      resolveEntryTranslationPanelPresentation({
        entry,
        isRequestPending: true,
        isSavePending: false,
        translation: null,
      }),
    ).toMatchObject({
      displayStatus: 'requesting',
      showTranslateAction: false,
      statusMessageKey: 'entry.translation.translating',
    })
  })

  it('shows pending and processing messages from backend status', () => {
    expect(
      resolveEntryTranslationPanelPresentation({
        entry,
        isRequestPending: false,
        isSavePending: false,
        translation: createTranslation('pending'),
      }).showPendingMessage,
    ).toBe(true)

    expect(
      resolveEntryTranslationPanelPresentation({
        entry,
        isRequestPending: false,
        isSavePending: false,
        translation: createTranslation('processing'),
      }).showPendingMessage,
    ).toBe(true)
  })

  it('shows editable fields for succeeded and stale translations', () => {
    expect(
      resolveEntryTranslationPanelPresentation({
        entry,
        isRequestPending: false,
        isSavePending: false,
        translation: createTranslation('succeeded'),
      }).showEditableFields,
    ).toBe(true)

    expect(
      resolveEntryTranslationPanelPresentation({
        entry: { ...entry, body: 'New body', version: 2 },
        isRequestPending: false,
        isSavePending: false,
        translation: createTranslation('succeeded', { source_version: 1 }),
      }),
    ).toMatchObject({
      displayStatus: 'stale',
      showEditableFields: true,
      showStaleMessage: true,
    })
  })

  it('shows retry action for failed translations', () => {
    expect(
      resolveEntryTranslationPanelPresentation({
        entry,
        isRequestPending: false,
        isSavePending: false,
        translation: createTranslation('failed'),
      }),
    ).toMatchObject({
      displayStatus: 'failed',
      showRetryAction: true,
      showFailedProviderMessage: true,
    })
  })
})
