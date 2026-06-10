import { useEffect } from 'react'
import { syncPendingOperations } from '@/shared/sync/sync.service'

export function SyncManager() {
  useEffect(() => {
    let synchronizing = false
    const synchronize = () => {
      if (
        synchronizing ||
        !navigator.onLine ||
        document.visibilityState === 'hidden'
      ) {
        return
      }
      synchronizing = true
      void syncPendingOperations()
        .catch(() => undefined)
        .finally(() => {
          synchronizing = false
        })
    }

    window.addEventListener('online', synchronize)
    document.addEventListener('visibilitychange', synchronize)
    const interval = window.setInterval(synchronize, 60_000)
    synchronize()

    return () => {
      window.removeEventListener('online', synchronize)
      document.removeEventListener('visibilitychange', synchronize)
      window.clearInterval(interval)
    }
  }, [])

  return null
}
