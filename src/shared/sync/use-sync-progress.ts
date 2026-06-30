import { useEffect, useState } from 'react'
import {
  getSyncProgress,
  subscribeSyncProgress,
  type SyncProgressSnapshot,
} from '@/shared/sync/sync-progress'

export function useSyncProgress(): SyncProgressSnapshot {
  const [snapshot, setSnapshot] = useState(getSyncProgress)

  useEffect(
    () =>
      subscribeSyncProgress(() => {
        setSnapshot(getSyncProgress())
      }),
    [],
  )

  return snapshot
}
