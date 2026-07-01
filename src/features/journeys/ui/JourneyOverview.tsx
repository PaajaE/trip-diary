import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, MapPin, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { listJourneyChecklistItems } from '@/entities/checklist/api/checklist-mutation.repository'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { getJourneyEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type {
  JourneyMoment,
  JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import { JourneyStorySection } from '@/features/journeys/ui/JourneyStorySection'
import {
  loadJourneyGalleryPreviews,
  mergeJourneyGalleryPhotos,
} from '@/features/journeys/lib/journey-gallery'
import type { JourneySection } from '@/features/journeys/ui/JourneySectionTabs'
import { TripSummaryLine } from '@/features/journeys/ui/TripSummaryLine'
import { NatureOnTripStrip } from '@/features/nature/ui/NatureOnTripStrip'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { cn } from '@/shared/lib/cn'

interface JourneyOverviewProps {
  canEdit: boolean
  creatorId: string
  journey: JourneyDetail
  journeyId: string
  mapPointCount: number
  moments: JourneyMoment[]
  onAddPlace?: () => void
  onChanged: () => void
  onNavigateSection: (section: JourneySection) => void
  onOpenEntry: (entryId: string) => void
  onShowNatureOnMap?: (stopId: string) => void
  natureDetailOpen?: boolean
  onNatureDetailOpenChange?: (open: boolean) => void
  showInlineCapture?: boolean
  stageContents: JourneyStageContent[]
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}

export function JourneyOverview({
  canEdit,
  creatorId,
  journey,
  journeyId,
  mapPointCount,
  moments,
  onAddPlace,
  onChanged,
  onNavigateSection,
  onOpenEntry,
  onShowNatureOnMap,
  natureDetailOpen,
  onNatureDetailOpenChange,
  showInlineCapture = false,
  stageContents,
  tagsByPhotoId,
}: JourneyOverviewProps) {
  const { t } = useTranslation()
  const checklistQuery = useQuery({
    queryFn: () => listJourneyChecklistItems(journeyId),
    queryKey: ['journey-checklist', journeyId],
  })
  const checklistItems = Array.isArray(checklistQuery.data)
    ? checklistQuery.data
    : []
  const natureChecked = checklistItems.filter(
    (item) => item.checkedAt !== null,
  ).length
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

  const summaryText =
    journey.summary === '' ? t('journey.summaryFallback') : journey.summary
  const summaryIsFallback = journey.summary === ''

  return (
    <section
      className="scroll-mt-24 py-6 sm:scroll-mt-20 sm:py-8"
      id="overview"
    >
      <p
        className={cn(
          'max-w-2xl leading-7 text-muted',
          summaryIsFallback && 'italic',
        )}
      >
        {summaryText}
      </p>

      <div className="mt-5">
        <TripSummaryLine
          mapPointCount={mapPointCount}
          momentCount={moments.length}
          natureChecked={natureChecked}
          natureTotal={checklistItems.length}
          photoCount={photos.length}
        />
      </div>

      {showInlineCapture && canEdit ? (
        <div className="mt-6">
          <Link
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground sm:w-auto"
            params={{ journeyId }}
            to="/j/$journeyId/memory/new"
          >
            <Plus aria-hidden="true" size={18} />
            {t('journey.addMoment')}
          </Link>
          {onAddPlace !== undefined ? (
            <div className="mt-3">
              <button
                className="text-sm text-primary hover:underline"
                onClick={onAddPlace}
                type="button"
              >
                {t('journey.addPlace')}
              </button>
            </div>
          ) : null}
        </div>
      ) : canEdit && onAddPlace !== undefined ? (
        <div className="mt-6">
          <button
            className="text-sm text-primary hover:underline"
            onClick={onAddPlace}
            type="button"
          >
            {t('journey.addPlace')}
          </button>
        </div>
      ) : null}

      <NatureOnTripStrip
        canEdit={canEdit}
        className="mt-8"
        creatorId={creatorId}
        {...(natureDetailOpen !== undefined
          ? { detailOpen: natureDetailOpen }
          : {})}
        journeyId={journeyId}
        onChanged={onChanged}
        {...(onNatureDetailOpenChange !== undefined
          ? { onDetailOpenChange: onNatureDetailOpenChange }
          : {})}
        {...(onShowNatureOnMap !== undefined ? { onShowNatureOnMap } : {})}
      />

      {isEmpty && !canEdit ? (
        <div className="mt-8 rounded-[1.5rem] border border-dashed border-border bg-surface p-6 shadow-soft">
          <h3 className="text-xl font-semibold">{t('journey.emptyTitle')}</h3>
          <p className="mt-3 max-w-2xl leading-7 text-muted">
            {t('journey.emptyRoute')}
          </p>
        </div>
      ) : !isEmpty ? (
        <>
          {recentPhotos.length > 0 ? (
            <div className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <h3 className="font-medium">{t('journey.recentPhotos')}</h3>
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
              <h3 className="font-medium">{t('journey.map')}</h3>
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
              <p className="mt-4 rounded-xl bg-background/60 p-5 text-sm text-muted">
                {t('journey.mapEmpty')}
              </p>
            ) : (
              <button
                className="mt-4 flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl bg-background/60 p-6 text-center transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:h-40"
                onClick={() => {
                  onNavigateSection('map')
                }}
                type="button"
              >
                <MapPin
                  aria-hidden="true"
                  className="text-primary/80"
                  size={24}
                />
                <p className="text-sm text-muted">
                  {t('journey.mappedCount', { count: mapPointCount })}
                </p>
              </button>
            )}
          </div>

          <div className="mt-12" id="story">
            <h3 className="font-medium">{t('journey.story')}</h3>
            <JourneyStorySection
              canEdit={canEdit}
              creatorId={creatorId}
              journey={journey}
              journeyId={journeyId}
              moments={moments}
              onChanged={onChanged}
              onOpenEntry={onOpenEntry}
              stageContents={stageContents}
              tagsByPhotoId={tagsByPhotoId}
            />
          </div>
        </>
      ) : null}
    </section>
  )
}
