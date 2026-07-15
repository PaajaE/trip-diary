import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  computeSourceContentHash,
  type EntryTranslation,
} from '@trip-diary/translation'
import { translationQueryKeys } from '@/entities/translation/api/translation-query-keys'
import { invalidateEntryTranslations } from '@/entities/translation/api/invalidate-entry-translations'
import { useEntryTranslationQuery } from '@/entities/translation/api/use-entry-translation-query'
import { useRequestEntryTranslationMutation } from '@/entities/translation/api/use-request-entry-translation-mutation'
import { useSaveEntryTranslationEditsMutation } from '@/entities/translation/api/use-save-entry-translation-edits-mutation'
import { shouldPollEntryTranslation } from '@/entities/translation/lib/entry-translation-polling'

const {
  getEntryTranslationMock,
  requestEntryTranslationMock,
  saveEntryTranslationEditsMock,
} = vi.hoisted(() => ({
  getEntryTranslationMock:
    vi.fn<
      (
        entryId: string,
        targetLocale: string,
      ) => Promise<EntryTranslation | null>
    >(),
  requestEntryTranslationMock: vi.fn(),
  saveEntryTranslationEditsMock: vi.fn(),
}))

vi.mock('@/entities/translation/api/translation.repository', () => ({
  getEntryTranslation: getEntryTranslationMock,
  requestEntryTranslation: requestEntryTranslationMock,
  saveEntryTranslationEdits: saveEntryTranslationEditsMock,
}))

const entryId = '550e8400-e29b-41d4-a716-446655440000'
const translationId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

function createTranslation(
  status: EntryTranslation['status'],
): EntryTranslation {
  return {
    completed_at:
      status === 'succeeded' ? '2026-07-10T12:00:00.000+00:00' : null,
    created_at: '2026-07-10T11:00:00.000+00:00',
    edited_at: null,
    entry_id: entryId,
    error_message: null,
    id: translationId,
    is_manually_edited: false,
    model: status === 'succeeded' ? 'mock-model' : null,
    provider: status === 'succeeded' ? 'mock' : null,
    requested_at: '2026-07-10T11:00:00.000+00:00',
    source_content_hash: computeSourceContentHash('Praha', 'Body text'),
    source_locale: 'cs',
    source_version: 1,
    status,
    target_locale: 'en',
    translated_body: status === 'succeeded' ? 'Translated body text.' : '',
    translated_title: status === 'succeeded' ? 'Translated title' : null,
    updated_at: '2026-07-10T12:00:00.000+00:00',
  }
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

describe('translation query hooks', () => {
  beforeEach(() => {
    getEntryTranslationMock.mockReset()
    requestEntryTranslationMock.mockReset()
    saveEntryTranslationEditsMock.mockReset()
  })

  it('invalidates only translations for the edited entry', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    await invalidateEntryTranslations(queryClient, entryId)

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: translationQueryKeys.byEntry(entryId),
    })
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: translationQueryKeys.byEntry('other-entry'),
    })
  })

  it('polls only while translation status is pending or processing', async () => {
    getEntryTranslationMock.mockResolvedValue(createTranslation('processing'))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const { result } = renderHook(
      () => useEntryTranslationQuery(entryId, 'en'),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(result.current.data?.status).toBe('processing')
    })

    expect(shouldPollEntryTranslation(result.current.data)).toBe(true)
  })

  it('invalidates the detail query after generation succeeds', async () => {
    requestEntryTranslationMock.mockResolvedValue({
      entry_id: entryId,
      model: 'mock-model',
      provider: 'mock',
      source_locale: 'cs',
      status: 'succeeded',
      target_locale: 'en',
      translated_body: '[en] Body text',
      translated_title: '[en] Praha',
    })
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useRequestEntryTranslationMutation(), {
      wrapper: createWrapper(queryClient),
    })

    await result.current.mutateAsync({ entryId, targetLocale: 'en' })

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: translationQueryKeys.detail(entryId, 'en'),
    })
  })

  it('updates cached translation after manual save succeeds', async () => {
    const saved = createTranslation('succeeded')
    saved.translated_body = 'Edited body.'
    saved.is_manually_edited = true
    saveEntryTranslationEditsMock.mockResolvedValue(saved)

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    queryClient.setQueryData(
      translationQueryKeys.detail(entryId, 'en'),
      createTranslation('succeeded'),
    )

    const { result } = renderHook(
      () => useSaveEntryTranslationEditsMutation(),
      { wrapper: createWrapper(queryClient) },
    )

    await result.current.mutateAsync({
      entryId,
      targetLocale: 'en',
      translatedBody: 'Edited body.',
      translatedTitle: 'Edited title',
      translationId,
    })

    expect(
      queryClient.getQueryData<EntryTranslation>(
        translationQueryKeys.detail(entryId, 'en'),
      )?.translated_body,
    ).toBe('Edited body.')
  })

  it('keeps previous translation data when refetch fails', async () => {
    const succeeded = createTranslation('succeeded')
    getEntryTranslationMock
      .mockResolvedValueOnce(succeeded)
      .mockRejectedValueOnce(new Error('network'))

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const { result } = renderHook(
      () => useEntryTranslationQuery(entryId, 'en'),
      { wrapper: createWrapper(queryClient) },
    )

    await waitFor(() => {
      expect(result.current.data?.status).toBe('succeeded')
    })

    const refetchResult = await result.current.refetch()

    expect(refetchResult.isError).toBe(true)
    expect(result.current.data?.status).toBe('succeeded')
  })
})
