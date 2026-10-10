import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { useWorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { mom, seg } from '@/features/journey-workspace/test-fixtures'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

const repo = vi.hoisted(() => ({
  updateMoment: vi.fn(),
  updateSegment: vi.fn(),
}))
vi.mock('@/entities/moment/api/moment.repository', () => ({
  mergeMoments: vi.fn(),
  splitMoment: vi.fn(),
  updateMoment: repo.updateMoment,
}))
vi.mock('@/entities/segment/api/segment.repository', () => ({
  acceptSuggestedSegment: vi.fn(),
  moveSegmentBoundary: vi.fn(),
  rejectSuggestedSegment: vi.fn(),
  restoreSuggestedSegment: vi.fn(),
  updateSegment: repo.updateSegment,
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

describe('workspace text edits', () => {
  beforeEach(() => {
    repo.updateMoment.mockReset().mockResolvedValue(undefined)
    repo.updateSegment.mockReset().mockResolvedValue(undefined)
  })

  it('saves segment text and Undo restores the previous title and body', async () => {
    const { result, toasts } = setup()
    const segment = seg(1, { body: 'old body', title: 'Old' })
    await act(async () => {
      await result.current.saveSegmentText(segment, { body: 'b', title: 'New' })
    })
    expect(repo.updateSegment).toHaveBeenCalledWith(segment.id, {
      body: 'b',
      title: 'New',
    })
    await act(async () => {
      toasts[0]?.action?.onClick()
      await Promise.resolve()
    })
    expect(repo.updateSegment).toHaveBeenLastCalledWith(segment.id, {
      body: 'old body',
      title: 'Old',
    })
  })

  it('saves moment text (null title) and Undo restores it', async () => {
    const { result, toasts } = setup()
    const moment = mom(10, { body: 'x', title: 'Lunch' })
    await act(async () => {
      await result.current.saveMomentText(moment, { body: '', title: null })
    })
    expect(repo.updateMoment).toHaveBeenCalledWith(moment.id, {
      body: '',
      title: null,
    })
    await act(async () => {
      toasts[0]?.action?.onClick()
      await Promise.resolve()
    })
    expect(repo.updateMoment).toHaveBeenLastCalledWith(moment.id, {
      body: 'x',
      title: 'Lunch',
    })
  })

  it('rolls back the optimistic cache and toasts an error on failure', async () => {
    const { queryClient, result, toasts } = setup()
    const segment = seg(1, { title: 'Old' })
    queryClient.setQueryData(['segments', 'journey', 'j'], [segment])
    repo.updateSegment.mockRejectedValue(new Error('nope'))
    let ok = true
    await act(async () => {
      ok = await result.current.saveSegmentText(segment, {
        body: '',
        title: 'N',
      })
    })
    expect(ok).toBe(false)
    expect(toasts[0]).toMatchObject({ variant: 'error' })
  })
})
