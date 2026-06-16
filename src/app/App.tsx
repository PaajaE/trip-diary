import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { LocaleSync } from '@/app/LocaleSync'
import { queryClient } from '@/app/query-client'
import { router } from '@/app/router'
import { SyncManager } from '@/app/SyncManager'
import { SessionProvider } from '@/features/auth/session'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <LocaleSync />
        <SyncManager />
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>
  )
}
