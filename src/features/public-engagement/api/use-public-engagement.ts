import type { PublicEngagement } from '@trip-diary/core/public-engagement'
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addHeart,
  getMyHearts,
  getMyPendingComments,
  getPublicEngagement,
  mapEngagementError,
  removeHeart,
  type EngagementError,
  type EngagementTarget,
} from '@/entities/public-engagement/api/public-engagement.repository'
import { ensureGuestSession } from '@/features/auth/api/guest-session'
import { useSession } from '@/features/auth/session'
import {
  usePublicEngagementScope,
  type PublicEngagementScopeValue,
} from '@/features/public-engagement/lib/scope-context'

export const publicEngagementKeys = {
  hearts: (userId: string) => ['my-hearts', userId] as const,
  pending: (userId: string) => ['my-pending-comments', userId] as const,
  tree: (scope: PublicEngagementScopeValue) =>
    ['public-engagement', scope.spaceHandle, scope.journeySlug] as const,
}

function useAfterIdle(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(
        () => {
          setReady(true)
        },
        { timeout: 2500 },
      )
      return () => {
        window.cancelIdleCallback(handle)
      }
    }
    const handle = window.setTimeout(() => {
      setReady(true)
    }, 200)
    return () => {
      window.clearTimeout(handle)
    }
  }, [])
  return ready
}

/**
 * Counts and approved comments for the whole journey tree: one RPC, deferred
 * until the browser is idle so the first paint and request count are unaffected.
 */
export function usePublicEngagementTree() {
  const scope = usePublicEngagementScope()
  const idle = useAfterIdle()
  return useQuery({
    enabled: scope !== null && idle,
    queryFn: () =>
      scope === null
        ? Promise.resolve(null)
        : getPublicEngagement(scope.spaceHandle, scope.journeySlug),
    queryKey:
      scope === null ? ['public-engagement'] : publicEngagementKeys.tree(scope),
    staleTime: 30_000,
  })
}

export function useMyPendingComments() {
  const { user } = useSession()
  const idle = useAfterIdle()
  const userId = user?.id
  return useQuery({
    enabled: userId !== undefined && idle,
    queryFn: () =>
      userId === undefined ? Promise.resolve([]) : getMyPendingComments(userId),
    queryKey: publicEngagementKeys.pending(userId ?? ''),
    staleTime: 30_000,
  })
}

function heartsQuery(userId: string) {
  return {
    queryFn: () => getMyHearts(),
    queryKey: publicEngagementKeys.hearts(userId),
    staleTime: 60_000,
  }
}

const same = (a: EngagementTarget, b: EngagementTarget) =>
  a.id === b.id && a.type === b.type

function adjustCount(
  tree: PublicEngagement | null | undefined,
  target: EngagementTarget,
  delta: 1 | -1,
): PublicEngagement | null | undefined {
  if (tree === null || tree === undefined) return tree
  const existing = tree.hearts.find(
    (h) => h.targetId === target.id && h.targetType === target.type,
  )
  if (existing === undefined) {
    return delta === 1
      ? {
          ...tree,
          hearts: [
            ...tree.hearts,
            { count: 1, targetId: target.id, targetType: target.type },
          ],
        }
      : tree
  }
  const count = Math.max(0, existing.count + delta)
  return {
    ...tree,
    hearts: tree.hearts.flatMap((h) =>
      h !== existing ? [h] : count === 0 ? [] : [{ ...h, count }],
    ),
  }
}

export interface HeartState {
  busy: boolean
  count: number
  error: EngagementError | null
  hearted: boolean
  toggle: () => Promise<void>
}

async function toggleHeart(
  queryClient: QueryClient,
  scope: PublicEngagementScopeValue,
  target: EngagementTarget,
): Promise<void> {
  // First action creates the guest session (and may show the captcha).
  const user = await ensureGuestSession()
  const heartsKey = publicEngagementKeys.hearts(user.id)
  const treeKey = publicEngagementKeys.tree(scope)
  const mine = await queryClient.fetchQuery(heartsQuery(user.id))
  const wasHearted = mine.some((t) => same(t, target))

  const previousHearts = queryClient.getQueryData(heartsKey)
  const previousTree = queryClient.getQueryData<PublicEngagement | null>(
    treeKey,
  )
  queryClient.setQueryData<EngagementTarget[]>(heartsKey, (old = []) =>
    wasHearted ? old.filter((t) => !same(t, target)) : [...old, target],
  )
  queryClient.setQueryData<PublicEngagement | null>(treeKey, (old) =>
    adjustCount(old, target, wasHearted ? -1 : 1),
  )
  try {
    await (wasHearted ? removeHeart(target) : addHeart(target, user.id))
  } catch (error) {
    queryClient.setQueryData(heartsKey, previousHearts)
    queryClient.setQueryData(treeKey, previousTree)
    throw mapEngagementError(error)
  }
  void queryClient.invalidateQueries({ queryKey: treeKey })
}

export function useHeart(target: EngagementTarget): HeartState | null {
  const scope = usePublicEngagementScope()
  const { user } = useSession()
  const queryClient = useQueryClient()
  const tree = usePublicEngagementTree()
  const hearts = useQuery({
    ...heartsQuery(user?.id ?? ''),
    enabled: user !== null,
  })
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<EngagementError | null>(null)

  const toggle = useCallback(async () => {
    if (scope === null || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await toggleHeart(queryClient, scope, target)
    } catch (caught) {
      setError(mapEngagementError(caught))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [queryClient, scope, target])

  if (scope === null) return null
  const count =
    tree.data?.hearts.find(
      (h) => h.targetId === target.id && h.targetType === target.type,
    )?.count ?? 0
  return {
    busy,
    count,
    error,
    hearted: hearts.data?.some((t) => same(t, target)) ?? false,
    toggle,
  }
}
