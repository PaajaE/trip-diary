import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import { momentQueryKeys } from '@/entities/moment/api/moment-query-keys'
import { MomentError } from '@/entities/moment/model/moment'
import { useWorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { med, mom } from '@/features/journey-workspace/test-fixtures'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

const repo = vi.hoisted(() => ({
  deleteMomentWithMedia: vi.fn(),
  restoreMedia: vi.fn(),
  setJourneyCover: vi.fn(),
  trashMedia: vi.fn(),
  updateMoment: vi.fn(),
}))
vi.mock('@/entities/media/api/media-trash.repository', () => ({
  restoreMedia: repo.restoreMedia,
  trashMedia: repo.trashMedia,
}))
vi.mock('@/entities/journey/api/journey-cover.repository', () => ({
  setJourneyCover: repo.setJourneyCover,
}))
vi.mock('@/entities/moment/api/moment.repository', () => ({
  deleteMomentWithMedia: repo.deleteMomentWithMedia,
  mergeMoments: vi.fn(),
  splitMoment: vi.fn(),
  updateMoment: repo.updateMoment,
}))

function setup() {
  const queryClient = new QueryClient()
  const toasts: ShowToastOptions[] = []
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider
        value={{
          showToast: (o) => {
            toasts.push(o)
          },
        }}
      >
        {children}
      </ToastContext.Provider>
    </QueryClientProvider>
  )
  const { result } = renderHook(() => useWorkspaceEdits('j'), { wrapper })
  return { queryClient, result, toasts }
}

describe('workspace trash edits', () => {
  beforeEach(() => {
    for (const fn of Object.values(repo)) fn.mockReset().mockResolvedValue(1)
  })

  it('Undo restores the media and sets back the covers the trash cleared', async () => {
    const { queryClient, result, toasts } = setup()
    const photo = med(20)
    const moment = mom(10, { coverMediaId: photo.id })
    queryClient.setQueryData(mediaQueryKeys.journey('j'), [photo])
    queryClient.setQueryData(momentQueryKeys.journey('j'), [moment])
    queryClient.setQueryData(journeyQueryKeys.cover('j'), photo.id)
    await act(async () => {
      await result.current.trashMedia([photo])
    })
    expect(repo.trashMedia).toHaveBeenCalledWith([photo.id])
    await act(async () => {
      toasts[0]?.action?.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(repo.restoreMedia).toHaveBeenCalledWith([photo.id])
    expect(repo.updateMoment).toHaveBeenCalledWith(moment.id, {
      coverMediaId: photo.id,
    })
    expect(repo.setJourneyCover).toHaveBeenCalledWith('j', photo.id)
  })

  it('does not touch covers that did not point at the trashed media', async () => {
    const { queryClient, result, toasts } = setup()
    const photo = med(20)
    queryClient.setQueryData(mediaQueryKeys.journey('j'), [photo])
    queryClient.setQueryData(momentQueryKeys.journey('j'), [
      mom(10, { coverMediaId: med(21).id }),
    ])
    await act(async () => {
      await result.current.trashMedia([photo])
    })
    await act(async () => {
      toasts[0]?.action?.onClick()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(repo.updateMoment).not.toHaveBeenCalled()
    expect(repo.setJourneyCover).not.toHaveBeenCalled()
  })

  it('reports no_neighbour without a toast and rolls the moment back', async () => {
    const { queryClient, result, toasts } = setup()
    const moment = mom(10)
    queryClient.setQueryData(momentQueryKeys.journey('j'), [moment])
    repo.deleteMomentWithMedia.mockRejectedValue(
      new MomentError('invalid_input', 'no neighbour with the same visibility'),
    )
    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.deleteMoment(moment, 'keep_media')
    })
    expect(outcome).toBe('no_neighbour')
    expect(toasts).toHaveLength(0)
    expect(queryClient.getQueryData(momentQueryKeys.journey('j'))).toEqual([
      moment,
    ])
  })

  it('treats the same error in trash_media mode as a plain failure', async () => {
    const { result, toasts } = setup()
    repo.deleteMomentWithMedia.mockRejectedValue(
      new MomentError('invalid_input', 'x'),
    )
    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.deleteMoment(mom(10), 'trash_media')
    })
    expect(outcome).toBe('failed')
    expect(toasts[0]?.variant).toBe('error')
  })
})
