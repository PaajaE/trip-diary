import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from '@tanstack/react-router'
import { getPublicSpace } from '@/entities/sharing/api/public-sharing.repository'
import { buildPublicSpaceShare } from '@/features/sharing/lib/build-share-messages'
import { PublicSpacePage } from '@/pages/public-space'

export function PublicSpaceRoutePage() {
  const { spaceHandle } = useParams({ from: '/$spaceHandle' })
  const navigate = useNavigate()
  const query = useQuery({
    queryFn: () => getPublicSpace(spaceHandle),
    queryKey: ['public-space', spaceHandle],
  })

  if (query.isPending) return <Message>Načítám cestovní deník…</Message>
  if (query.isError) return <Message error>Deník se nepodařilo načíst.</Message>
  if (query.data === null)
    return <Message>Tento cestovní deník neexistuje.</Message>

  const space = query.data
  const spaceShare = buildPublicSpaceShare(space.handle, space.name)
  return (
    <PublicSpacePage
      onOpenEntry={(entryId) => {
        const entry = space.standaloneEntries.find(({ id }) => id === entryId)
        if (entry !== undefined) {
          void navigate({
            params: { entrySlug: entry.slug, spaceHandle },
            to: '/$spaceHandle/tipy/$entrySlug',
          })
        }
      }}
      onOpenJourney={(journeyId) => {
        const journey = space.journeys.find(({ id }) => id === journeyId)
        if (journey !== undefined) {
          void navigate({
            params: { journeySlug: journey.slug, spaceHandle },
            to: '/$spaceHandle/$journeySlug',
          })
        }
      }}
      shareText={spaceShare.shareText}
      shareUrl={spaceShare.shareUrl}
      space={{
        avatarUrl: space.avatarUrl,
        bio: space.bio,
        handle: space.handle,
        journeys: space.journeys.map((journey) => ({
          dateLabel: journey.starts_at,
          id: journey.id,
          statusLabel: journey.status,
          summary: journey.summary,
          title: journey.title,
        })),
        name: space.name,
        standaloneEntries: space.standaloneEntries.map((entry) => ({
          dateLabel: new Date(
            entry.event_at ?? entry.published_at ?? 0,
          ).toLocaleDateString('cs'),
          excerpt: entry.body.slice(0, 180),
          id: entry.id,
          title: entry.title ?? 'Vzpomínka bez názvu',
          typeLabel: entry.type,
        })),
      }}
    />
  )
}

function Message({
  children,
  error = false,
}: {
  children: React.ReactNode
  error?: boolean
}) {
  return (
    <main
      className={`mx-auto max-w-3xl px-5 py-16 ${error ? 'text-destructive' : 'text-muted'}`}
    >
      {children}
    </main>
  )
}
