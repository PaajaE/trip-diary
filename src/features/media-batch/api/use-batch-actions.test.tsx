import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import type { MediaItem } from '@/entities/media/model/media-library'
import { useBatchActions } from '@/features/media-batch/api/use-batch-actions'
import { med, uuid } from '@/features/journey-workspace/test-fixtures'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

const repo = vi.hoisted(() => ({
  createMomentFromMedia: vi.fn(() => Promise.resolve('new-moment')),
  deleteMomentWithMedia: vi.fn(() => Promise.resolve()),
  detachMediaFromMoment: vi.fn(() => Promise.resolve()),
  markMediaReviewed: vi.fn(() => Promise.resolve(1)),
  moveMedia: vi.fn(() => Promise.resolve(1)),
  restoreMedia: vi.fn(() => Promise.resolve(1)),
  trashMedia: vi.fn(() => Promise.resolve(1)),
  updateMediaMeta: vi.fn(() => Promise.resolve({})),
}))
vi.mock('@/entities/media/api/media-review.repository', () => ({
  markMediaReviewed: repo.markMediaReviewed,
}))
vi.mock('@/entities/media/api/media-trash.repository', () => ({
  createMomentFromMedia: repo.createMomentFromMedia,
  moveMedia: repo.moveMedia,
  restoreMedia: repo.restoreMedia,
  trashMedia: repo.trashMedia,
}))
vi.mock('@/entities/media/api/media-library.repository', () => ({
  detachMediaFromMoment: repo.detachMediaFromMoment,
  updateMediaMeta: repo.updateMediaMeta,
}))
vi.mock('@/entities/moment/api/moment.repository', () => ({
  deleteMomentWithMedia: repo.deleteMomentWithMedia,
}))

const J = 'j'
const M1 = uuid(101)
const TARGET = uuid(102)

function setup(initial: MediaItem[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(mediaQueryKeys.unreviewed(J), initial)
  const toasts: ShowToastOptions[] = []
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider
        value={{
          showToast: (options) => {
            toasts.push(options)
          },
        }}
      >
        {children}
      </ToastContext.Provider>
    </QueryClientProvider>
  )
  const { result } = renderHook(() => useBatchActions(J), { wrapper })
  const cached = () =>
    queryClient
      .getQueryData<MediaItem[]>(mediaQueryKeys.unreviewed(J))
      ?.map((item) => item.id)
  const starred = () =>
    queryClient
      .getQueryData<MediaItem[]>(mediaQueryKeys.unreviewed(J))
      ?.map((item) => item.starred)
  return { cached, result, starred, toasts }
}

const a = med(1, { momentId: M1 })
const b = med(2)
const c = med(3)

beforeEach(async () => {
  vi.clearAllMocks()
  await i18n.changeLanguage('en')
})

describe('useBatchActions', () => {
  it('Done marks the media as sorted, hides the tiles and Undo marks them as waiting', async () => {
    const { cached, result, toasts } = setup([a, b, c])
    let ok = false
    await act(async () => {
      ok = await result.current.done([a, b])
    })
    expect(ok).toBe(true)
    expect(repo.markMediaReviewed).toHaveBeenCalledWith([a.id, b.id])
    expect(cached()).toEqual([c.id])
    expect(toasts[0]).toMatchObject({ message: 'Handled: 2' })
    await act(async () => {
      toasts[0]?.action?.onClick()
      await Promise.resolve()
    })
    expect(repo.markMediaReviewed).toHaveBeenLastCalledWith([a.id, b.id], false)
  })

  it('puts the tiles back and reports the error when marking fails', async () => {
    repo.markMediaReviewed.mockRejectedValueOnce(new Error('rls'))
    const { cached, result, toasts } = setup([a, b])
    let ok = true
    await act(async () => {
      ok = await result.current.done([a])
    })
    expect(ok).toBe(false)
    expect(cached()).toEqual([a.id, b.id])
    expect(toasts[0]).toMatchObject({ variant: 'error' })
  })

  it('move sets the moment and reviewed_at; Undo restores every origin', async () => {
    const { cached, result, toasts } = setup([a, b, c])
    await act(async () => {
      await result.current.moveTo([a, b], TARGET)
    })
    expect(repo.moveMedia).toHaveBeenCalledWith([a.id, b.id], TARGET)
    expect(repo.markMediaReviewed).toHaveBeenCalledWith([a.id, b.id])
    expect(cached()).toEqual([c.id])
    await act(async () => {
      toasts[0]?.action?.onClick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    // a came from a moment, b from none.
    expect(repo.moveMedia).toHaveBeenLastCalledWith([a.id], M1)
    expect(repo.detachMediaFromMoment).toHaveBeenCalledWith([b.id])
    expect(repo.markMediaReviewed).toHaveBeenLastCalledWith([a.id, b.id], false)
  })

  it('new stop creates the moment and sets reviewed_at; Undo removes the stop again', async () => {
    const { result, toasts } = setup([a, b])
    await act(async () => {
      await result.current.newStop([a, b])
    })
    expect(repo.createMomentFromMedia).toHaveBeenCalledWith([a.id, b.id])
    expect(repo.markMediaReviewed).toHaveBeenCalledWith([a.id, b.id])
    await act(async () => {
      toasts[0]?.action?.onClick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(repo.moveMedia).toHaveBeenCalledWith([a.id], M1)
    expect(repo.detachMediaFromMoment).toHaveBeenCalledWith([b.id])
    expect(repo.deleteMomentWithMedia).toHaveBeenCalledWith(
      'new-moment',
      'keep_media',
    )
    expect(repo.markMediaReviewed).toHaveBeenLastCalledWith([a.id, b.id], false)
  })

  it('trash removes the tiles with an Undo toast and needs no reviewed_at write', async () => {
    const { cached, result, toasts } = setup([a, b])
    await act(async () => {
      await result.current.trash([a])
    })
    expect(repo.trashMedia).toHaveBeenCalledWith([a.id])
    expect(repo.markMediaReviewed).not.toHaveBeenCalled()
    expect(cached()).toEqual([b.id])
    expect(toasts[0]?.action?.label).toBe('Undo')
    await act(async () => {
      toasts[0]?.action?.onClick()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(repo.restoreMedia).toHaveBeenCalledWith([a.id])
  })

  it('star changes the star only: no reviewed_at, tiles stay', async () => {
    const { cached, result, starred } = setup([a, b])
    await act(async () => {
      await result.current.star([a, b])
    })
    expect(repo.updateMediaMeta).toHaveBeenCalledTimes(2)
    expect(repo.updateMediaMeta).toHaveBeenCalledWith(a.id, { starred: true })
    expect(repo.markMediaReviewed).not.toHaveBeenCalled()
    expect(cached()).toEqual([a.id, b.id])
    expect(starred()).toEqual([true, true])
  })
})
