import { useParams } from '@tanstack/react-router'
import type { PublicJourney } from '@trip-diary/core/public-journey'
import { usePublicJourney } from '@/entities/public-journey/api/use-public-journey'
import { PublicJourneySkeleton } from '@/features/public-journey/ui/PublicJourneySkeleton'
import { PublicJourneyPage } from '@/pages/public-journey/PublicJourneyPage'
import { PublicMomentPage } from '@/pages/public-journey/PublicMomentPage'
import { PublicSegmentPage } from '@/pages/public-journey/PublicSegmentPage'
import {
  PublicRouteError,
  PublicRouteNotFound,
} from '@/pages/public-space/PublicRouteMessage'

interface Resolved {
  content: (data: PublicJourney) => React.ReactNode
  initialData?: PublicJourney | null
  journeySlug: string
  spaceHandle: string
}

function ResolvedJourney({
  content,
  initialData,
  journeySlug,
  spaceHandle,
}: Resolved) {
  const query = usePublicJourney(spaceHandle, journeySlug, initialData)
  if (query.isPending) return <PublicJourneySkeleton />
  if (query.isError) {
    return <PublicRouteError labelKey="publicReader.journeyError" />
  }
  if (query.data === null) {
    return <PublicRouteNotFound labelKey="publicReader.journeyNotFound" />
  }
  return <>{content(query.data)}</>
}

export function PublicJourneyRoutePage() {
  const { journeySlug, spaceHandle } = useParams({
    from: '/$spaceHandle/$journeySlug',
  })
  return (
    <ResolvedJourney
      content={(data) => (
        <PublicJourneyPage
          data={data}
          journeySlug={journeySlug}
          spaceHandle={spaceHandle}
        />
      )}
      journeySlug={journeySlug}
      spaceHandle={spaceHandle}
    />
  )
}

export function PublicSegmentRoutePage() {
  const { journeySlug, segmentId, spaceHandle } = useParams({
    from: '/$spaceHandle/$journeySlug/e/$segmentId',
  })
  return (
    <ResolvedJourney
      content={(data) => (
        <PublicSegmentPage
          data={data}
          journeySlug={journeySlug}
          segmentId={segmentId}
          spaceHandle={spaceHandle}
        />
      )}
      journeySlug={journeySlug}
      spaceHandle={spaceHandle}
    />
  )
}

export function PublicMomentRoutePage() {
  const { journeySlug, momentId, spaceHandle } = useParams({
    from: '/$spaceHandle/$journeySlug/m/$momentId',
  })
  return (
    <ResolvedJourney
      content={(data) => (
        <PublicMomentPage
          data={data}
          journeySlug={journeySlug}
          momentId={momentId}
          spaceHandle={spaceHandle}
        />
      )}
      journeySlug={journeySlug}
      spaceHandle={spaceHandle}
    />
  )
}
