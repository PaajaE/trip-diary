import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { getSyncStatusSnapshot } from '@/shared/sync/sync-status'

export function useSyncStatus(creatorId: string | undefined) {
  const [online, setOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  )
  const snapshot = useLiveQuery(async () => {
    if (creatorId === undefined) {
      return null
    }
    return getSyncStatusSnapshot(creatorId)
  }, [creatorId, online])

  useEffect(() => {
    function updateOnlineStatus() {
      setOnline(navigator.onLine)
    }
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  return snapshot ?? undefined
}
