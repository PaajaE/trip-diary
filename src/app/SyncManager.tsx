import { useEffect } from 'react'
import { syncPendingOperations } from '@/shared/sync/sync.service'

export function SyncManager() {
  useEffect(() => {
    const synchronize = () => {
      void syncPendingOperations().catch(() => undefined)
    }

    window.addEventListener('online', synchronize)
    synchronize()

    return () => {
      window.removeEventListener('online', synchronize)
    }
  }, [])

  return null
}
