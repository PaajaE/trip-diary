import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement, ReactNode } from 'react'
import TestRenderer, { type ReactTestRenderer } from 'react-test-renderer'
import { AuthProvider } from '@/platform/auth/AuthProvider'
import { createQueryClient } from '@/foundation/query-client'

export interface RenderWithProvidersOptions {
  queryClient?: QueryClient
  wrapper?: ({ children }: { children: ReactNode }) => ReactElement
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): ReactTestRenderer {
  const queryClient = options.queryClient ?? createQueryClient()

  function Providers({ children }: { children: ReactNode }) {
    const content = <AuthProvider>{children}</AuthProvider>

    if (options.wrapper !== undefined) {
      const Wrapper = options.wrapper
      return (
        <QueryClientProvider client={queryClient}>
          <Wrapper>{content}</Wrapper>
        </QueryClientProvider>
      )
    }

    return (
      <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
    )
  }

  return TestRenderer.create(<Providers>{ui}</Providers>)
}
