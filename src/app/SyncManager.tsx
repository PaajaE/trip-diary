import { useEffect } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { Network } from '@capacitor/network'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'

export function SyncManager() {
  useEffect(() => {
    let synchronizing = false
    const synchronize = async () => {
      if (synchronizing || document.visibilityState === 'hidden') {
        return
      }
      synchronizing = true
      try {
        if (await canAutomaticallySync()) {
          await syncPendingOperations()
        }
      } catch {
        // Pending operations remain queued for the next automatic or manual sync.
      } finally {
        synchronizing = false
      }
    }

    const requestSync = () => {
      void synchronize()
    }
    window.addEventListener('online', requestSync)
    document.addEventListener('visibilitychange', requestSync)
    const interval = window.setInterval(requestSync, 60_000)
    const nativeListeners = Promise.all([
      Network.addListener('networkStatusChange', requestSync),
      NativeApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          requestSync()
        }
      }),
    ])
    requestSync()

    return () => {
      window.removeEventListener('online', requestSync)
      document.removeEventListener('visibilitychange', requestSync)
      window.clearInterval(interval)
      void nativeListeners.then((listeners) => {
        for (const listener of listeners) {
          void listener.remove()
        }
      })
    }
  }, [])

  return null
}
