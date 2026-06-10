import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import {
  resolvePublicEntry,
  resolvePublicJourneyEntry,
} from '@/entities/sharing/api/public-sharing.repository'
import { EntryPage } from '@/pages/entry/EntryPage'

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
  return (
    <ResolvedEntry
      queryFn={() =>
        resolvePublicJourneyEntry(spaceHandle, journeySlug, entrySlug)
      }
      queryKey={['public-journey-entry', spaceHandle, journeySlug, entrySlug]}
    />
  )
}

function ResolvedEntry({
  queryFn,
  queryKey,
}: {
  queryFn: () => Promise<string | null>
  queryKey: string[]
}) {
  const query = useQuery({ queryFn, queryKey })
  if (query.isPending) return <Message>Načítám vzpomínku…</Message>
  if (query.isError || query.data === null) {
    return <Message>Tato veřejná vzpomínka neexistuje.</Message>
  }
  return <EntryPage entryId={query.data} shareUrl={window.location.href} />
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-muted">{children}</main>
  )
}
