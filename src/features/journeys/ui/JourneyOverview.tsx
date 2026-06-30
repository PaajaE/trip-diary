import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  Images,
  Lightbulb,
  MapPin,
  Plus,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { getJourneyEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import {
  loadJourneyGalleryPreviews,
  mergeJourneyGalleryPhotos,
} from '@/features/journeys/lib/journey-gallery'
import type { JourneySection } from '@/features/journeys/ui/JourneySectionTabs'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { cn } from '@/shared/lib/cn'

interface JourneyOverviewProps {
  canEdit: boolean
  journey: JourneyDetail
  journeyId: string
  mapPointCount: number
  moments: JourneyMoment[]
  onAddAdvice: () => void
  onAddPlace: () => void
  onNavigateSection: (section: JourneySection) => void
  onOpenEntry: (entryId: string) => void
}

export function JourneyOverview({
  canEdit,
  journey,
  journeyId,
  mapPointCount,
  moments,
  onAddAdvice,
  onAddPlace,
  onNavigateSection,
  onOpenEntry,
}: JourneyOverviewProps) {
  const { t } = useTranslation()
  const isEmpty =
    journey.stages.length === 0 &&
    journey.stops.length === 0 &&
    journey.entries.length === 0

  const previewsQuery = useQuery({
    enabled: moments.length > 0,
    queryFn: () =>
      loadJourneyGalleryPreviews(moments, getJourneyEntryPhotoPreviews),
    queryKey: ['journey-gallery', ...moments.map((moment) => moment.entry.id)],
  })
  const photos = useMemo(() => {
    const merged = mergeJourneyGalleryPhotos(
      moments,
      previewsQuery.data?.previewsByMoment ?? [],
    )
    const eventAtByEntry = new Map(
      moments.map((moment) => [moment.entry.id, moment.entry.eventAt ?? '']),
    )
    return merged.sort((left, right) =>
      (eventAtByEntry.get(right.entryId) ?? '').localeCompare(
        eventAtByEntry.get(left.entryId) ?? '',
      ),
    )
  }, [moments, previewsQuery.data?.previewsByMoment])
  const photoUrls = usePhotoObjectUrls(photos)
  const recentPhotos = photoUrls.slice(0, 6)

  const recentMoments = useMemo(
    () =>
      [...moments]
        .sort((left, right) => {
          const leftTime = left.entry.eventAt ?? ''
          const rightTime = right.entry.eventAt ?? ''
          return rightTime.localeCompare(leftTime)
        })
        .slice(0, 3),
    [moments],
  )

  const summaryText =
    journey.summary === '' ? t('journey.summaryFallback') : journey.summary
  const summaryIsFallback = journey.summary === ''

  return (
    <section
      className="scroll-mt-24 py-8 sm:scroll-mt-20 sm:py-10"
      id="overview"
    >
      <div>
        <p className="text-sm font-medium text-accent">
          {t('journey.overviewEyebrow')}
        </p>
        <h2 className="mt-3 text-2xl font-semibold">{t('journey.overview')}</h2>
      </div>

      <p
        className={cn(
          'mt-6 max-w-2xl leading-7',
          summaryIsFallback ? 'text-muted italic' : 'text-muted',
        )}
      >
        {summaryText}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          count={moments.length}
          icon={BookOpen}
          label={t('journey.momentsCount', { count: moments.length })}
          onClick={() => {
            onNavigateSection('story')
          }}
        />
        <StatCard
          count={photos.length}
          icon={Images}
          label={t('journey.photosCount', { count: photos.length })}
          onClick={() => {
            onNavigateSection('gallery')
          }}
        />
        <StatCard
          count={mapPointCount}
          icon={MapPin}
          label={t('journey.mappedCount', { count: mapPointCount })}
          onClick={() => {
            onNavigateSection('map')
          }}
        />
        <StatCard
          count={journey.guides.length}
          icon={Lightbulb}
          label={t('journey.guidesCount', { count: journey.guides.length })}
          onClick={() => {
            onNavigateSection('guides')
          }}
        />
      </div>

      {canEdit ? (
        <div className="mt-8">
          <p className="text-sm font-medium text-accent">
            {t('journey.captureEyebrow')}
          </p>
          <h3 className="mt-2 text-lg font-semibold">
            {t('journey.captureTitle')}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            {t('journey.captureDescription')}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <CaptureAction
              description={t('journey.memoryDescription')}
              icon={Plus}
              journeyId={journeyId}
              label={t('journey.addMoment')}
              primary
              to="/j/$journeyId/memory/new"
            />
            <CaptureAction
              description={t('journey.placeDescription')}
              icon={MapPin}
              label={t('journey.addPlace')}
              onClick={onAddPlace}
            />
            <CaptureAction
              description={t('journey.guidesDescription')}
              icon={Lightbulb}
              label={t('journey.addGuide')}
              onClick={onAddAdvice}
            />
          </div>
        </div>
      ) : null}

      {isEmpty && !canEdit ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-border bg-surface p-6 shadow-soft">
          <h3 className="text-xl font-semibold">{t('journey.emptyTitle')}</h3>
          <p className="mt-3 max-w-2xl leading-7 text-muted">
            {t('journey.emptyRoute')}
          </p>
        </div>
      ) : !isEmpty ? (
        <>
          {recentMoments.length > 0 ? (
            <div className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <h3 className="text-lg font-semibold">
                  {t('journey.recentMoments')}
                </h3>
                <button
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  onClick={() => {
                    onNavigateSection('story')
                  }}
                  type="button"
                >
                  {t('journey.viewFullStory')}
                  <ArrowRight aria-hidden="true" size={14} />
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {recentMoments.map((moment) => (
                  <MomentPreview
                    key={moment.entry.id}
                    moment={moment}
                    onOpen={() => {
                      onOpenEntry(moment.entry.id)
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {recentPhotos.length > 0 ? (
            <div className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <h3 className="text-lg font-semibold">
                  {t('journey.recentPhotos')}
                </h3>
                <button
                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                  onClick={() => {
                    onNavigateSection('gallery')
                  }}
                  type="button"
                >
                  {t('journey.viewGallery')}
                  <ArrowRight aria-hidden="true" size={14} />
                </button>
              </div>
              <div className="mt-4 flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory">
                {recentPhotos.map((photo) => (
                  <button
                    aria-label={
                      photo.entryTitle ?? t('journey.galleryUntitled')
                    }
                    className="relative h-24 w-24 shrink-0 snap-start overflow-hidden rounded-xl bg-surface shadow-soft transition-transform hover:scale-[1.02]"
                    key={`${photo.entryId}:${photo.id}`}
                    onClick={() => {
                      onNavigateSection('gallery')
                    }}
                    type="button"
                  >
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      src={photo.url}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : previewsQuery.isPending && moments.length > 0 ? (
            <p className="mt-10 text-sm text-muted" role="status">
              {t('journey.galleryLoading')}
            </p>
          ) : null}

          <div className="mt-10">
            <div className="flex items-end justify-between gap-4">
              <h3 className="text-lg font-semibold">{t('journey.map')}</h3>
              <button
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                onClick={() => {
                  onNavigateSection('map')
                }}
                type="button"
              >
                {t('journey.viewMap')}
                <ArrowRight aria-hidden="true" size={14} />
              </button>
            </div>
            {mapPointCount === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
                {t('journey.mapEmpty')}
              </p>
            ) : (
              <button
                className="mt-4 flex h-40 w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-[radial-gradient(circle_at_top_left,_rgba(40,88,69,0.12),_rgba(255,253,248,0.9))] p-6 text-center shadow-soft transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-48"
                onClick={() => {
                  onNavigateSection('map')
                }}
                type="button"
              >
                <MapPin aria-hidden="true" className="text-primary" size={28} />
                <p className="font-semibold">
                  {t('journey.mappedCount', { count: mapPointCount })}
                </p>
                <p className="text-sm text-primary">{t('journey.viewMap')}</p>
              </button>
            )}
          </div>
        </>
      ) : null}
    </section>
  )
}

function StatCard({
  count,
  icon: Icon,
  label,
  onClick,
}: {
  count: number
  icon: typeof BookOpen
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      className="rounded-2xl border border-border bg-surface p-4 text-left shadow-soft transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="text-accent" size={18} />
      <p className="mt-3 text-2xl font-semibold tabular-nums">{count}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{label}</p>
    </button>
  )
}

function CaptureAction({
  description,
  icon: Icon,
  journeyId,
  label,
  onClick,
  primary = false,
  to,
}: {
  description: string
  icon: typeof Plus
  journeyId?: string
  label: string
  onClick?: () => void
  primary?: boolean
  to?: '/j/$journeyId/memory/new'
}) {
  const className = cn(
    'flex min-h-[7rem] flex-col justify-between rounded-2xl p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
    primary
      ? 'border border-primary/20 bg-primary/5 hover:bg-primary/10'
      : 'border border-border bg-surface shadow-soft hover:bg-white',
  )

  const inner = (
    <>
      <Icon
        aria-hidden="true"
        className={primary ? 'text-primary' : 'text-accent'}
        size={20}
      />
      <div>
        <p className="font-semibold">{label}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
          {description}
        </p>
      </div>
    </>
  )

  if (to !== undefined && journeyId !== undefined) {
    return (
      <Link
        aria-label={label}
        className={className}
        params={{ journeyId }}
        to={to}
      >
        {inner}
      </Link>
    )
  }

  return (
    <button
      aria-label={label}
      className={className}
      onClick={onClick}
      type="button"
    >
      {inner}
    </button>
  )
}

function MomentPreview({
  moment,
  onOpen,
}: {
  moment: JourneyMoment
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const title = moment.entry.title ?? t('dashboard.untitled')

  return (
    <button
      className="w-full rounded-2xl border border-border bg-surface p-4 text-left shadow-soft transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      onClick={onOpen}
      type="button"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">
        {t(`entry.type.${moment.entry.type}`)}
      </p>
      <p className="mt-1 font-semibold">{title}</p>
      {moment.entry.body === '' ? null : (
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
          {moment.entry.body}
        </p>
      )}
    </button>
  )
}
