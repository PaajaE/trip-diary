import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { updateEntryContent } from '@/entities/entry/api/entry-mutation.repository'
import type { Entry } from '@/entities/entry/model/entry'
import { useMomentTextDraft } from '@/features/entries/lib/use-moment-text-draft'

vi.mock('@/entities/entry/api/entry-mutation.repository', () => ({
  updateEntryContent: vi.fn(),
}))

vi.mock('@/shared/sync/auto-sync', () => ({
  canAutomaticallySync: vi.fn().mockResolvedValue(false),
}))

vi.mock('@/shared/sync/sync.service', () => ({
  syncPendingOperations: vi.fn().mockResolvedValue(undefined),
}))

const creatorId = crypto.randomUUID()

function buildEntry(overrides: Partial<Entry> = {}): Entry {
  const now = new Date().toISOString()
  return {
    body: 'Story body',
    createdAt: now,
    creatorId,
    eventAt: now,
    id: crypto.randomUUID(),
    language: 'cs',
    publishedAt: now,
    slug: 'moment',
    spaceId: crypto.randomUUID(),
    status: 'published',
    syncStatus: 'synced',
    title: 'Moment title',
    type: 'story',
    updatedAt: now,
    version: 1,
    visibility: 'public',
    ...overrides,
  }
}

describe('useMomentTextDraft', () => {
  afterEach(() => {
    vi.mocked(updateEntryContent).mockReset()
  })

  it('autosaves edited title and body while edit mode is enabled', async () => {
    vi.useFakeTimers()
    const entry = buildEntry()
    const onUpdated = vi.fn()
    const updated = buildEntry({
      body: 'Updated body',
      id: entry.id,
      title: entry.title,
    })
    vi.mocked(updateEntryContent).mockResolvedValue(updated)

    const { result } = renderHook(() =>
      useMomentTextDraft({
        creatorId,
        enabled: true,
        entry,
        onUpdated,
      }),
    )

    act(() => {
      result.current.setBody('Updated body')
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(updateEntryContent).toHaveBeenCalledWith(entry.id, creatorId, {
      body: 'Updated body',
      title: entry.title,
    })
    expect(onUpdated).toHaveBeenCalledWith(updated)
    vi.useRealTimers()
  })

  it('flushes pending edits when leaving edit mode', async () => {
    const entry = buildEntry()
    const updated = buildEntry({
      body: 'Flushed body',
      id: entry.id,
      title: 'Flushed title',
    })
    vi.mocked(updateEntryContent).mockResolvedValue(updated)

    const { result } = renderHook(() =>
      useMomentTextDraft({
        creatorId,
        enabled: true,
        entry,
        onUpdated: vi.fn(),
      }),
    )

    act(() => {
      result.current.setTitle('Flushed title')
      result.current.setBody('Flushed body')
    })

    await act(async () => {
      await result.current.flushSave()
    })

    expect(updateEntryContent).toHaveBeenCalledWith(entry.id, creatorId, {
      body: 'Flushed body',
      title: 'Flushed title',
    })
  })
})
