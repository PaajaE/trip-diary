import { lazy, Suspense, useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { LocaleSync } from '@/app/LocaleSync'
import { queryClient } from '@/app/query-client'
import { router } from '@/app/router'
import { SessionProvider } from '@/features/auth/session'
import { ToastProvider } from '@/shared/ui/ToastProvider'

// Background sync pulls in Dexie and the sync engine; start it after first paint.
const SyncManager = lazy(() =>
  import('@/app/SyncManager').then(({ SyncManager }) => ({
    default: SyncManager,
  })),
)

function DeferredSyncManager() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const start = () => {
      setReady(true)
    }
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(start, { timeout: 3000 })
      return () => {
        window.cancelIdleCallback(handle)
      }
    }
    const handle = window.setTimeout(start, 0)
    return () => {
      window.clearTimeout(handle)
    }
  }, [])

  return ready ? (
    <Suspense fallback={null}>
      <SyncManager />
    </Suspense>
  ) : null
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ToastProvider>
          <LocaleSync />
          <DeferredSyncManager />
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}
