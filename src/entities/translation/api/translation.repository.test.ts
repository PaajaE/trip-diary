import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  computeSourceContentHash,
  deriveTranslationStatus,
  entryTranslationSchema,
} from '@trip-diary/translation'

const invokeMock = vi.fn()
const fromMock = vi.fn()

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({
    functions: { invoke: invokeMock },
    from: fromMock,
  }),
}))

const entryId = '550e8400-e29b-41d4-a716-446655440000'
const translationId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

function createTranslationRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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
    source_content_hash: computeSourceContentHash('Praha', 'Starý text'),
    source_locale: 'cs',
    source_version: 1,
    status: 'succeeded',
    target_locale: 'en',
    translated_body: '[en] Starý text',
    translated_title: '[en] Praha',
    updated_at: '2026-07-10T12:00:00.000+00:00',
    ...overrides,
  }
}

function mockEntryTranslationsTable(options: {
  maybeSingle?: { data: unknown; error: unknown }
  updateSingle?: { data: unknown; error: unknown }
}) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue(options.maybeSingle ?? { data: null, error: null })
  const single = vi
    .fn()
    .mockResolvedValue(options.updateSingle ?? { data: null, error: null })
  const secondEq = vi.fn().mockReturnValue({ maybeSingle })
  const firstEq = vi.fn().mockReturnValue({ eq: secondEq })
  const selectAfterUpdate = vi.fn().mockReturnValue({ single })
  const eqAfterUpdate = vi.fn().mockReturnValue({ select: selectAfterUpdate })
  const update = vi.fn().mockReturnValue({ eq: eqAfterUpdate })
  const select = vi.fn().mockReturnValue({ eq: firstEq })

  fromMock.mockReturnValue({ select, update })

  return { maybeSingle, single, update, select }
}

describe('translation repository contracts', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    fromMock.mockReset()
  })

  it('derives stale status when entry version changes', () => {
    const translation = entryTranslationSchema.parse(createTranslationRow())

    expect(
      deriveTranslationStatus(translation, {
        body: 'Nový text',
        title: 'Praha',
        version: 2,
      }),
    ).toBe('stale')
  })

  it('parses invoke success responses for idempotent translation', async () => {
    invokeMock.mockResolvedValue({
      data: {
        entry_id: entryId,
        model: 'mock-model',
        provider: 'mock',
        source_locale: 'cs',
        status: 'succeeded',
        target_locale: 'en',
        translated_body: '[en] Body',
        translated_title: '[en] Title',
      },
      error: null,
    })

    const { requestEntryTranslation } =
      await import('@/entities/translation/api/translation.repository')

    await expect(
      requestEntryTranslation({
        entry_id: entryId,
        target_locale: 'en',
      }),
    ).resolves.toEqual({
      entry_id: entryId,
      model: 'mock-model',
      provider: 'mock',
      source_locale: 'cs',
      status: 'succeeded',
      target_locale: 'en',
      translated_body: '[en] Body',
      translated_title: '[en] Title',
    })
  })

  it('surfaces unauthorized edge function errors', async () => {
    invokeMock.mockResolvedValue({
      data: { error: 'unauthorized' },
      error: null,
    })

    const { requestEntryTranslation } =
      await import('@/entities/translation/api/translation.repository')

    await expect(
      requestEntryTranslation({
        entry_id: entryId,
        target_locale: 'en',
      }),
    ).rejects.toThrow('unauthorized')
  })

  it('throws translation_failed when invoke returns that error code', async () => {
    invokeMock.mockResolvedValue({
      data: { error: 'translation_failed' },
      error: null,
    })

    const { requestEntryTranslation } =
      await import('@/entities/translation/api/translation.repository')

    await expect(
      requestEntryTranslation({
        entry_id: entryId,
        target_locale: 'en',
      }),
    ).rejects.toThrow('translation_failed')
  })

  it('parses getEntryTranslation rows through entryTranslationSchema', async () => {
    const row = createTranslationRow()
    mockEntryTranslationsTable({
      maybeSingle: { data: row, error: null },
    })

    const { getEntryTranslation } =
      await import('@/entities/translation/api/translation.repository')

    await expect(getEntryTranslation(entryId, 'en')).resolves.toEqual(
      entryTranslationSchema.parse(row),
    )
  })

  it('returns null from getEntryTranslation when no row exists', async () => {
    mockEntryTranslationsTable({
      maybeSingle: { data: null, error: null },
    })

    const { getEntryTranslation } =
      await import('@/entities/translation/api/translation.repository')

    await expect(getEntryTranslation(entryId, 'en')).resolves.toBeNull()
  })

  it('persists manual edits through saveEntryTranslationEdits', async () => {
    const savedRow = createTranslationRow({
      edited_at: '2026-07-10T13:00:00.000+00:00',
      is_manually_edited: true,
      translated_body: 'Edited body',
      translated_title: 'Edited title',
    })
    const { update } = mockEntryTranslationsTable({
      updateSingle: { data: savedRow, error: null },
    })

    const { saveEntryTranslationEdits } =
      await import('@/entities/translation/api/translation.repository')

    await expect(
      saveEntryTranslationEdits(translationId, {
        translated_body: 'Edited body',
        translated_title: 'Edited title',
      }),
    ).resolves.toEqual(entryTranslationSchema.parse(savedRow))

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        is_manually_edited: true,
        translated_body: 'Edited body',
        translated_title: 'Edited title',
      }),
    )
  })

  it('refreshes translations by invoking translate-entry then reloading the row', async () => {
    const row = createTranslationRow({
      translated_body: '[en] Fresh body',
      translated_title: '[en] Fresh title',
    })
    invokeMock.mockResolvedValue({
      data: {
        entry_id: entryId,
        model: 'mock-model',
        provider: 'mock',
        source_locale: 'cs',
        status: 'succeeded',
        target_locale: 'en',
        translated_body: '[en] Fresh body',
        translated_title: '[en] Fresh title',
      },
      error: null,
    })
    mockEntryTranslationsTable({
      maybeSingle: { data: row, error: null },
    })

    const { refreshEntryTranslation } =
      await import('@/entities/translation/api/translation.repository')

    await expect(refreshEntryTranslation(entryId, 'en')).resolves.toEqual(
      entryTranslationSchema.parse(row),
    )

    expect(invokeMock).toHaveBeenCalledWith('translate-entry', {
      body: {
        entry_id: entryId,
        target_locale: 'en',
      },
    })
  })
})
