import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getJourneyPublicPath,
  listPendingComments,
  moderateComment,
  type PendingComment,
} from '@/entities/public-engagement/api/public-engagement.repository'

const pendingKey = (journeyId: string) =>
  ['pending-comments', journeyId] as const

export function usePendingComments(journeyId: string) {
  return useQuery({
    queryFn: () => listPendingComments(journeyId),
    queryKey: pendingKey(journeyId),
    retry: false,
  })
}

export function useJourneyPublicPath(journeyId: string) {
  return useQuery({
    queryFn: () => getJourneyPublicPath(journeyId),
    queryKey: ['journey-public-path', journeyId] as const,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

/** Approve or reject; the comment leaves the list at once and returns on failure. */
export function useModerateComment(journeyId: string) {
  const queryClient = useQueryClient()
  const key = pendingKey(journeyId)
  return useMutation({
    mutationFn: ({
      commentId,
      status,
    }: {
      commentId: string
      status: 'approved' | 'rejected'
    }) => moderateComment(commentId, status),
    onError: (_error, _vars, previous) => {
      queryClient.setQueryData(key, previous)
    },
    onMutate: async ({ commentId }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<PendingComment[]>(key)
      queryClient.setQueryData<PendingComment[]>(key, (old = []) =>
        old.filter((c) => c.id !== commentId),
      )
      return previous
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
