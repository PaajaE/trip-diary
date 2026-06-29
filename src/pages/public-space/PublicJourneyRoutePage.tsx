import { useQuery } from '@tanstack/react-query'
import { useParams, useSearch } from '@tanstack/react-router'
import { resolvePublicJourneyMeta } from '@/entities/sharing/api/public-sharing.repository'
import { JourneyReaderPage } from '@/pages/reader/JourneyReaderPage'

export function PublicJourneyRoutePage() {
  const { journeySlug, spaceHandle } = useParams({
    from: '/$spaceHandle/$journeySlug',
  })
  const search = useSearch({ from: '/$spaceHandle/$journeySlug' })
  const query = useQuery({
    queryFn: () => resolvePublicJourneyMeta(spaceHandle, journeySlug),
    queryKey: ['public-journey-meta', spaceHandle, journeySlug],
  })
  if (query.isPending) return <Message>Načítám cestu…</Message>
  if (query.isError || query.data === null) {
    return <Message>Tato veřejná cesta neexistuje.</Message>
  }
  return (
    <JourneyReaderPage
      journeyId={query.data.id}
      publicPaths={{ journeySlug, spaceHandle }}
      {...(search.section !== undefined ? { section: search.section } : {})}
    />
  )
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-muted">{children}</main>
  )
}
