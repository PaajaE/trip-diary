import { useEffect, useState } from 'react'
import {
  getSyncCoordinatorSnapshot,
  subscribeSyncCoordinatorSnapshot,
  type SyncCoordinatorSnapshot,
} from '@/foundation/sync/sync-observable'

export function useSyncCoordinatorSnapshot(): SyncCoordinatorSnapshot {
  const [snapshot, setSnapshot] = useState(getSyncCoordinatorSnapshot())

  useEffect(() => {
    return subscribeSyncCoordinatorSnapshot(setSnapshot)
  }, [])

  return snapshot
}
