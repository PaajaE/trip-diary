import { lazy, Suspense, useEffect, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { LocaleSync } from '@/app/LocaleSync'
import { queryClient } from '@/app/query-client'
import { router } from '@/app/router'
import { isPublicReaderPath } from '@/features/sharing/lib/is-public-reader-path'
import { SessionProvider } from '@/features/auth/session'
import { ToastProvider } from '@/shared/ui/ToastProvider'

// Background sync pulls in Dexie and the sync engine; start it after first paint.
const SyncManager = lazy(() =>
  import('@/app/SyncManager').then(({ SyncManager }) => ({
    default: SyncManager,
  })),
)

// Native deep links; Capacitor retains the launch URL until a listener attaches.
const DeepLinkHandler = lazy(() =>
  import('@/app/DeepLinkHandler').then(({ DeepLinkHandler }) => ({
    default: DeepLinkHandler,
  })),
)

function DeferredBackgroundServices() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const start = () => {
      setReady(true)
    }
    // Public readers have nothing to sync: keep Dexie and the sync engine out
    // of the load window there (still well before the first 60 s sync tick).
    const delay = isPublicReaderPath(window.location.pathname) ? 6000 : 0
    let cancelIdle: (() => void) | undefined
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        const handle = window.requestIdleCallback(start, { timeout: 3000 })
        cancelIdle = () => {
          window.cancelIdleCallback(handle)
        }
        return
      }
      const handle = window.setTimeout(start, 0)
      cancelIdle = () => {
        window.clearTimeout(handle)
      }
    }
    const timer = window.setTimeout(schedule, delay)
    return () => {
      window.clearTimeout(timer)
      cancelIdle?.()
    }
  }, [])

  return ready ? (
    <Suspense fallback={null}>
      <SyncManager />
      <DeepLinkHandler />
    </Suspense>
  ) : null
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ToastProvider>
          <LocaleSync />
          <DeferredBackgroundServices />
          <RouterProvider router={router} />
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}
