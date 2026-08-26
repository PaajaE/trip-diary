import { ArrowRight, MapPinned } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PublicJourneyViewModel } from '@/pages/public-space/model'

interface PublicJourneyCardProps {
  journey: PublicJourneyViewModel
  onOpen: (journeyId: string) => void
}

export function PublicJourneyCard({ journey, onOpen }: PublicJourneyCardProps) {
  const { t } = useTranslation()

  return (
    <button
      className="group overflow-hidden rounded-[1.25rem] border border-border/70 bg-surface text-left shadow-soft transition-colors hover:bg-white"
      onClick={() => {
        onOpen(journey.id)
      }}
      type="button"
    >
      {journey.coverUrl === undefined || journey.coverUrl === null ? (
        <div className="flex aspect-[16/9] items-center justify-center bg-primary/10 text-primary">
          <MapPinned aria-hidden="true" size={30} />
        </div>
      ) : (
        <img
          alt=""
          className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          loading="lazy"
          sizes="(min-width: 640px) 480px, 100vw"
          src={journey.coverUrl}
          {...(journey.coverSrcSet !== undefined &&
          journey.coverSrcSet !== null &&
          journey.coverSrcSet !== ''
            ? { srcSet: journey.coverSrcSet }
            : {})}
        />
      )}
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wide text-accent">
          <span>{journey.statusLabel}</span>
          {journey.dateLabel === undefined ||
          journey.dateLabel === null ? null : (
            <span className="text-muted">{journey.dateLabel}</span>
          )}
        </div>
        <h3 className="reader-display mt-2 text-xl">{journey.title}</h3>
        {journey.summary === undefined ||
        journey.summary === null ||
        journey.summary === '' ? null : (
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted">
            {journey.summary}
          </p>
        )}
        <span className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
          {t('publicSpace.openJourney')}
          <ArrowRight
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-1"
            size={16}
          />
        </span>
      </div>
    </button>
  )
}
