import { BookOpen, MapPinned } from 'lucide-react'
import { PublicEntryCard } from '@/pages/public-space/PublicEntryCard'
import { PublicJourneyCard } from '@/pages/public-space/PublicJourneyCard'
import { PublicSpaceHeader } from '@/pages/public-space/PublicSpaceHeader'
import type { PublicSpaceViewModel } from '@/pages/public-space/model'

interface PublicSpacePageProps {
  onOpenEntry: (entryId: string) => void
  onOpenJourney: (journeyId: string) => void
  shareText: string
  shareUrl: string
  space: PublicSpaceViewModel
}

export function PublicSpacePage({
  onOpenEntry,
  onOpenJourney,
  shareText,
  shareUrl,
  space,
}: PublicSpacePageProps) {
  return (
    <main className="mx-auto min-h-svh w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
      <PublicSpaceHeader
        {...(space.avatarUrl === undefined
          ? {}
          : { avatarUrl: space.avatarUrl })}
        {...(space.bio === undefined ? {} : { bio: space.bio })}
        handle={space.handle}
        name={space.name}
        shareText={shareText}
        shareUrl={shareUrl}
      />

      <PublicSection
        emptyDescription="Jakmile tu přibude první cesta, najdete ji právě tady."
        emptyTitle="Zatím žádné veřejné cesty"
        icon={MapPinned}
        title="Cesty"
      >
        {space.journeys.map((journey) => (
          <PublicJourneyCard
            journey={journey}
            key={journey.id}
            onOpen={onOpenJourney}
          />
        ))}
      </PublicSection>

      <PublicSection
        emptyDescription="Samostatné vzpomínky a tipy se tu objeví po zveřejnění."
        emptyTitle="Zatím žádné veřejné příspěvky"
        icon={BookOpen}
        title="Z deníku"
      >
        {space.standaloneEntries.map((entry) => (
          <PublicEntryCard entry={entry} key={entry.id} onOpen={onOpenEntry} />
        ))}
      </PublicSection>
    </main>
  )
}

interface PublicSectionProps {
  children: React.ReactNode[]
  emptyDescription: string
  emptyTitle: string
  icon: typeof MapPinned
  title: string
}

function PublicSection({
  children,
  emptyDescription,
  emptyTitle,
  icon: Icon,
  title,
}: PublicSectionProps) {
  return (
    <section className="border-b border-border py-10 last:border-b-0 sm:py-12">
      <h2 className="flex items-center gap-3 text-2xl font-semibold">
        <Icon aria-hidden="true" size={22} />
        {title}
      </h2>
      {children.length === 0 ? (
        <div className="mt-6 rounded-md border border-dashed border-border p-6">
          <p className="font-semibold">{emptyTitle}</p>
          <p className="mt-2 leading-7 text-muted">{emptyDescription}</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">{children}</div>
      )}
    </section>
  )
}
