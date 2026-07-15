import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24,
        networkMode: 'offlineFirst',
        refetchOnReconnect: true,
        refetchOnMount: true,
        retry: 1,
        staleTime: 30_000,
      },
      mutations: {
        networkMode: 'offlineFirst',
        retry: 0,
      },
    },
  })
}
