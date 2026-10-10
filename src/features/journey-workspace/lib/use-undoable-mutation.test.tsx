import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  optimisticUpdate,
  patchListItem,
} from '@/features/journey-workspace/lib/optimistic-cache'
import {
  useUndoableMutation,
  type UndoableEdit,
} from '@/features/journey-workspace/lib/use-undoable-mutation'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

const LABELS = { undo: 'Undo', undoFailed: 'Undo failed', undone: 'Undone' }

function setup() {
  const queryClient = new QueryClient()
  const toasts: ShowToastOptions[] = []
  const showToast = (options: ShowToastOptions) => {
    toasts.push(options)
  }
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>
      <ToastContext.Provider value={{ showToast }}>
        {children}
      </ToastContext.Provider>
    </QueryClientProvider>
  )
  const { result } = renderHook(() => useUndoableMutation('j', LABELS), {
    wrapper,
  })
  return { queryClient, result, toasts }
}

function edit(over: Partial<UndoableEdit> = {}): UndoableEdit {
  return {
    apply: vi.fn(() => Promise.resolve()),
    errorMessage: 'boom',
    successMessage: 'saved',
    undo: vi.fn(() => Promise.resolve()),
    ...over,
  }
}

describe('useUndoableMutation', () => {
  it('applies, shows an Undo toast and invalidates the tree', async () => {
    const { queryClient, result, toasts } = setup()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const e = edit()
    let ok = false
    await act(async () => {
      ok = await result.current(e)
    })
    expect(ok).toBe(true)
    expect(e.apply).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledTimes(3)
    expect(toasts[0]).toMatchObject({ message: 'saved' })
    expect(toasts[0]?.action?.label).toBe('Undo')
  })

  it('undo calls the inverse repository call and confirms', async () => {
    const { result, toasts } = setup()
    const e = edit()
    await act(async () => {
      await result.current(e)
    })
    await act(async () => {
      toasts[0]?.action?.onClick()
      await Promise.resolve()
    })
    expect(e.undo).toHaveBeenCalledOnce()
    await vi.waitFor(() => {
      expect(toasts.at(-1)).toMatchObject({ message: 'Undone' })
    })
  })

  it('rolls back the optimistic change and shows an error toast on failure', async () => {
    const { queryClient, result, toasts } = setup()
    const key = ['list']
    queryClient.setQueryData(key, [{ id: 'a', v: 1 }])
    const e = edit({
      apply: () => Promise.reject(new Error('nope')),
      optimistic: (direction) =>
        optimisticUpdate<{ id: string; v: number }[]>(
          queryClient,
          key,
          (list) =>
            patchListItem(list, 'a', { v: direction === 'apply' ? 2 : 1 }),
        ),
    })
    let ok = true
    await act(async () => {
      ok = await result.current(e)
    })
    expect(ok).toBe(false)
    expect(queryClient.getQueryData(key)).toEqual([{ id: 'a', v: 1 }])
    expect(toasts).toEqual([{ message: 'boom', variant: 'error' }])
  })

  it('is optimistic before the repository resolves', async () => {
    const { queryClient, result } = setup()
    const key = ['list']
    queryClient.setQueryData(key, [{ id: 'a', v: 1 }])
    let release: () => void = () => undefined
    const e = edit({
      apply: () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
      optimistic: () =>
        optimisticUpdate<{ id: string; v: number }[]>(queryClient, key, (l) =>
          patchListItem(l, 'a', { v: 2 }),
        ),
    })
    let pending: Promise<boolean> = Promise.resolve(false)
    act(() => {
      pending = result.current(e)
    })
    expect(queryClient.getQueryData(key)).toEqual([{ id: 'a', v: 2 }])
    await act(async () => {
      release()
      await pending
    })
  })

  it('rolls back an optimistic undo that fails', async () => {
    const { queryClient, result, toasts } = setup()
    const key = ['list']
    queryClient.setQueryData(key, [{ id: 'a', v: 1 }])
    const e = edit({
      optimistic: (direction) =>
        optimisticUpdate<{ id: string; v: number }[]>(queryClient, key, (l) =>
          patchListItem(l, 'a', { v: direction === 'apply' ? 2 : 1 }),
        ),
      undo: () => Promise.reject(new Error('no')),
    })
    await act(async () => {
      await result.current(e)
    })
    expect(queryClient.getQueryData(key)).toEqual([{ id: 'a', v: 2 }])
    await act(async () => {
      toasts[0]?.action?.onClick()
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(toasts.at(-1)).toMatchObject({
        message: 'Undo failed',
        variant: 'error',
      })
    })
    expect(queryClient.getQueryData(key)).toEqual([{ id: 'a', v: 2 }])
  })
})
