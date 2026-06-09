import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { queryClient } from '@/app/query-client'
import { router } from '@/app/router'
import { SyncManager } from '@/app/SyncManager'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SyncManager />
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
