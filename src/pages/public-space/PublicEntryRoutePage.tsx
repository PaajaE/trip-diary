import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import {
  resolvePublicEntry,
  resolvePublicJourneyEntry,
  resolvePublicJourneyMeta,
} from '@/entities/sharing/api/public-sharing.repository'
import { MomentReaderPage } from '@/pages/reader/MomentReaderPage'
import {
  PublicRouteError,
  PublicRouteLoading,
  PublicRouteNotFound,
} from '@/pages/public-space/PublicRouteMessage'

export function PublicStandaloneEntryRoutePage() {
  const { entrySlug, spaceHandle } = useParams({
    from: '/$spaceHandle/tipy/$entrySlug',
  })
  return (
    <ResolvedEntry
      queryFn={() => resolvePublicEntry(spaceHandle, entrySlug)}
      queryKey={['public-entry', spaceHandle, entrySlug]}
    />
  )
}

export function PublicJourneyEntryRoutePage() {
  const { entrySlug, journeySlug, spaceHandle } = useParams({
    from: '/$spaceHandle/$journeySlug/$entrySlug',
  })
  const journeyMetaQuery = useQuery({
    queryFn: () => resolvePublicJourneyMeta(spaceHandle, journeySlug),
    queryKey: ['public-journey-meta', spaceHandle, journeySlug],
  })

  return (
    <ResolvedEntry
      {...(journeyMetaQuery.data?.id !== undefined
        ? { journeyId: journeyMetaQuery.data.id }
        : {})}
      publicPaths={{ journeySlug, spaceHandle }}
      queryFn={() =>
        resolvePublicJourneyEntry(spaceHandle, journeySlug, entrySlug)
      }
      queryKey={['public-journey-entry', spaceHandle, journeySlug, entrySlug]}
    />
  )
}

function ResolvedEntry({
  journeyId,
  publicPaths,
  queryFn,
  queryKey,
}: {
  journeyId?: string
  publicPaths?: { journeySlug: string; spaceHandle: string }
  queryFn: () => Promise<string | null>
  queryKey: string[]
}) {
  const query = useQuery({ queryFn, queryKey })

  if (query.isPending) {
    return <PublicRouteLoading labelKey="publicReader.momentLoading" />
  }
  if (query.isError) {
    return <PublicRouteError labelKey="publicReader.momentError" />
  }
  if (query.data === null) {
    return <PublicRouteNotFound labelKey="publicReader.momentNotFound" />
  }

  return (
    <MomentReaderPage
      entryId={query.data}
      {...(journeyId !== undefined ? { journeyId } : {})}
      {...(publicPaths !== undefined ? { publicPaths } : {})}
    />
  )
}
