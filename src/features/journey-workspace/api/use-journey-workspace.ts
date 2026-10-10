import { useMemo } from 'react'
import { useJourneyMediaQuery } from '@/entities/media/api/use-journey-media-query'
import { useJourneyMomentsQuery } from '@/entities/moment/api/use-journey-moments-query'
import { useJourneySegmentsQuery } from '@/entities/segment/api/use-journey-segments-query'
import {
  buildWorkspaceTree,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

export type JourneyWorkspaceState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; tree: WorkspaceTree }

export function useJourneyWorkspace(journeyId: string): JourneyWorkspaceState {
  const segments = useJourneySegmentsQuery(journeyId)
  const moments = useJourneyMomentsQuery(journeyId)
  const media = useJourneyMediaQuery(journeyId)

  const tree = useMemo(
    () =>
      segments.data && moments.data && media.data
        ? buildWorkspaceTree(segments.data, moments.data, media.data)
        : null,
    [segments.data, moments.data, media.data],
  )

  if (segments.isError || moments.isError || media.isError) {
    return {
      retry: () => {
        void segments.refetch()
        void moments.refetch()
        void media.refetch()
      },
      status: 'error',
    }
  }
  if (tree === null) return { status: 'loading' }
  return { status: 'ready', tree }
}
