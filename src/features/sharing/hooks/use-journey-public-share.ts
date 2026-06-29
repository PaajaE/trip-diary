import { useQuery } from '@tanstack/react-query'
import { getJourneyPublicPaths } from '@/entities/sharing/api/public-sharing.repository'
import {
  buildPublicMomentShare,
  buildPublicTripShare,
} from '@/features/sharing/lib/build-share-messages'

export function useJourneyPublicShare(journeyId: string, title: string) {
  const pathsQuery = useQuery({
    enabled: journeyId !== '',
    queryFn: () => getJourneyPublicPaths(journeyId),
    queryKey: ['journey-public-paths', journeyId],
  })

  const paths = pathsQuery.data
  const tripShare =
    paths === null || paths === undefined
      ? null
      : buildPublicTripShare(paths, title)

  return {
    isLoading: pathsQuery.isPending,
    paths,
    tripShare,
  }
}

export function momentShareFromPaths(
  paths: NonNullable<Awaited<ReturnType<typeof getJourneyPublicPaths>>>,
  entrySlug: string,
  title: string,
) {
  return buildPublicMomentShare(paths, entrySlug, title)
}
