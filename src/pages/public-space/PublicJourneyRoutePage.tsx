import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { resolvePublicJourney } from '@/entities/sharing/api/public-sharing.repository'
import { JourneyPage } from '@/pages/journey/JourneyPage'

export function PublicJourneyRoutePage() {
  const { journeySlug, spaceHandle } = useParams({
    from: '/$spaceHandle/$journeySlug',
  })
  const query = useQuery({
    queryFn: () => resolvePublicJourney(spaceHandle, journeySlug),
    queryKey: ['public-journey', spaceHandle, journeySlug],
  })
  if (query.isPending) return <Message>Načítám cestu…</Message>
  if (query.isError || query.data === null) {
    return <Message>Tato veřejná cesta neexistuje.</Message>
  }
  return <JourneyPage journeyId={query.data} shareUrl={window.location.href} />
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-muted">{children}</main>
  )
}
