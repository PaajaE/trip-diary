import { QueryClient, onlineManager } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24,
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
      refetchOnWindowFocus: () => onlineManager.isOnline(),
      retry: 1,
      staleTime: 30_000,
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 0,
    },
  },
})
