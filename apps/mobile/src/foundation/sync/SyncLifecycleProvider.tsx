import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/platform/auth/AuthProvider'
import { useNetworkState } from '@/foundation/network/NetworkProvider'
import {
  canProcessSyncQueue,
  createSyncCoordinator,
  type SyncCoordinatorContext,
} from '@/foundation/sync/sync-coordinator'
import { subscribeSyncDrainRequests } from '@/foundation/sync/sync-drain-request'
import { subscribePhotoUploadSynced } from '@/foundation/sync/photo-upload-events'
import { updateSyncCoordinatorSnapshot } from '@/foundation/sync/sync-observable'
import { invalidateJourneyPhotoQueries } from '@/features/journeys/lib/journey-cache-mutations'
import { journeyQueryKeys } from '@/features/journeys/query-keys'
import { reconcileOrphanPhotoFiles } from '@/platform/media/draft-photos'
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

export function SyncLifecycleProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const networkState = useNetworkState()
  const queryClient = useQueryClient()
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
    void reconcileOrphanPhotoFiles().catch((error: unknown) => {
      console.warn('[photos] orphan reconcile failed', error)
    })
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
    return subscribePhotoUploadSynced((event) => {
      invalidateJourneyPhotoQueries(
        queryClient,
        event.journeyId,
        auth.session?.user.id,
      )
      if (event.entryId !== null) {
        void queryClient.invalidateQueries({
          queryKey: journeyQueryKeys.entry(event.entryId),
        })
      }
    })
  }, [auth.session?.user.id, queryClient])

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
