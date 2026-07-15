import { useEffect, useMemo, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useAuth } from '@/platform/auth/AuthProvider'
import { useNetworkState } from '@/foundation/network/NetworkProvider'
import {
  canProcessSyncQueue,
  createSyncCoordinator,
  type SyncCoordinatorContext,
} from '@/foundation/sync/sync-coordinator'
import { subscribeSyncDrainRequests } from '@/foundation/sync/sync-drain-request'
import { updateSyncCoordinatorSnapshot } from '@/foundation/sync/sync-observable'
import {
  drainSyncQueue,
  getSyncQueueStatusSummary,
} from '@/platform/sync/queue'

function isActiveAppState(state: AppStateStatus): boolean {
  return state === 'active'
}

function resolveWaitingPhase(context: SyncCoordinatorContext) {
  if (context.authLoading || context.sessionUserId === null) {
    return 'waiting_for_session' as const
  }

  return 'waiting_for_network' as const
}

export function SyncLifecycleProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const auth = useAuth()
  const networkState = useNetworkState()
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const contextRef = useRef<SyncCoordinatorContext>({
    appIsActive: isActiveAppState(appStateRef.current),
    authLoading: auth.isLoading,
    networkState,
    sessionUserId: auth.session?.user.id ?? null,
  })

  contextRef.current = {
    appIsActive: isActiveAppState(appStateRef.current),
    authLoading: auth.isLoading,
    networkState,
    sessionUserId: auth.session?.user.id ?? null,
  }

  const coordinator = useMemo(
    () =>
      createSyncCoordinator({
        drainQueue: (maxOperations) => drainSyncQueue(maxOperations),
        getQueueCounts: () => getSyncQueueStatusSummary(),
      }),
    [],
  )

  useEffect(() => {
    updateSyncCoordinatorSnapshot({
      phase: canProcessSyncQueue(contextRef.current)
        ? 'idle'
        : resolveWaitingPhase(contextRef.current),
    })
  }, [auth.isLoading, auth.session?.user.id, networkState.status])

  useEffect(() => {
    void coordinator.maybeRunDrain(contextRef.current, 'startup')
  }, [auth.isLoading, auth.session?.user.id, networkState.status, coordinator])

  useEffect(() => {
    void coordinator.handleNetworkChange(contextRef.current, 'network_online')
  }, [coordinator, networkState.status])

  useEffect(() => {
    return subscribeSyncDrainRequests((reason) => {
      void coordinator.maybeRunDrain(contextRef.current, reason)
    })
  }, [coordinator])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = isActiveAppState(appStateRef.current)
      appStateRef.current = nextState
      const isActive = isActiveAppState(nextState)
      contextRef.current = {
        ...contextRef.current,
        appIsActive: isActive,
      }

      if (!wasActive && isActive) {
        void coordinator.maybeRunDrain(contextRef.current, 'app_foreground')
        return
      }

      updateSyncCoordinatorSnapshot({
        phase: canProcessSyncQueue(contextRef.current)
          ? 'idle'
          : resolveWaitingPhase(contextRef.current),
      })
    })

    return () => {
      subscription.remove()
    }
  }, [coordinator])

  return children
}
