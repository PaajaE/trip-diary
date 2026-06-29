import { useQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import { resolvePublicJourneyMeta } from '@/entities/sharing/api/public-sharing.repository'
import { JourneyReaderPage } from '@/pages/reader/JourneyReaderPage'
import {
  PublicRouteError,
  PublicRouteLoading,
  PublicRouteNotFound,
} from '@/pages/public-space/PublicRouteMessage'

export function PublicJourneyRoutePage() {
  const { journeySlug, spaceHandle } = useParams({
    from: '/$spaceHandle/$journeySlug',
  })
  const search = useSearch({ from: '/$spaceHandle/$journeySlug' })
  const query = useQuery({
    queryFn: () => resolvePublicJourneyMeta(spaceHandle, journeySlug),
    queryKey: ['public-journey-meta', spaceHandle, journeySlug],
  })

  if (query.isPending) {
    return <PublicRouteLoading labelKey="publicReader.journeyLoading" />
  }
  if (query.isError) {
    return <PublicRouteError labelKey="publicReader.journeyError" />
  }
  if (query.data === null) {
    return <PublicRouteNotFound labelKey="publicReader.journeyNotFound" />
  }

  return (
    <JourneyReaderPage
      journeyId={query.data.id}
      publicPaths={{ journeySlug, spaceHandle }}
      {...(search.section !== undefined ? { section: search.section } : {})}
    />
  )
}
