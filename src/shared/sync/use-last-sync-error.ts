import { useEffect, useState } from 'react'
import {
  getLastSyncError,
  subscribeLastSyncError,
} from '@/shared/sync/sync-last-error'

export function useLastSyncError(): string | null {
  const [message, setMessage] = useState(getLastSyncError)

  useEffect(
    () =>
      subscribeLastSyncError(() => {
        setMessage(getLastSyncError())
      }),
    [],
  )

  return message
}
