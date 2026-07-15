import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getJourneyPublicPaths } from '@/entities/sharing/api/public-sharing.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import {
  buildPublicMomentShare,
  buildPublicTripShare,
} from '@/features/sharing/lib/build-share-messages'

export function useJourneyPublicShare(journeyId: string, title: string) {
  const { t } = useTranslation()
  const pathsQuery = useQuery({
    enabled: journeyId !== '',
    queryFn: () => getJourneyPublicPaths(journeyId),
    queryKey: journeyQueryKeys.publicPaths(journeyId),
  })

  const paths = pathsQuery.data
  const tripShare =
    paths === null || paths === undefined
      ? null
      : buildPublicTripShare(paths, t('reader.shareTripMessage', { title }))

  return {
    isError: pathsQuery.isError,
    isLoading: pathsQuery.isPending,
    paths,
    refetch: pathsQuery.refetch,
    tripShare,
  }
}

export function momentShareFromPaths(
  paths: NonNullable<Awaited<ReturnType<typeof getJourneyPublicPaths>>>,
  entrySlug: string,
  title: string,
  formatMomentMessage: (title: string) => string,
) {
  return buildPublicMomentShare(paths, entrySlug, formatMomentMessage(title))
}
