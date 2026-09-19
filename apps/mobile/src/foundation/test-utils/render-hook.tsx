import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { createElement, type ReactElement, type ReactNode } from 'react'
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer'
import { createQueryClient } from '@/foundation/query-client'

export interface RenderHookResult<TResult> {
  result: { current: TResult }
  unmount: () => void
}

export interface RenderHookOptions {
  queryClient?: QueryClient
  wrapper?: ({ children }: { children: ReactNode }) => ReactElement
}

/**
 * Minimal hook harness for Vitest + react-test-renderer (no RTL dependency).
 */
export function renderHook<TResult>(
  useHook: () => TResult,
  options: RenderHookOptions = {},
): RenderHookResult<TResult> {
  const queryClient = options.queryClient ?? createQueryClient()
  const result: { current: TResult } = {
    current: undefined as TResult,
  }

  function HookProbe() {
    result.current = useHook()
    return null
  }

  function Providers({ children }: { children: ReactNode }) {
    if (options.wrapper !== undefined) {
      const Wrapper = options.wrapper
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Wrapper, { children }),
      )
    }

    return createElement(QueryClientProvider, { client: queryClient }, children)
  }

  let renderer: ReactTestRenderer
  act(() => {
    renderer = TestRenderer.create(
      createElement(Providers, null, createElement(HookProbe)),
    )
  })

  return {
    result,
    unmount: () => {
      act(() => {
        renderer.unmount()
      })
    },
  }
}

export async function waitForHook(
  assertion: () => void,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 3_000
  const startedAt = Date.now()
  let lastError: unknown

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
    }

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10)
      })
    })
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('waitForHook timed out')
}
