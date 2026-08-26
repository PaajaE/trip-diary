import { useQuery } from '@tanstack/react-query'
import { Camera, MapPin, Plus, StickyNote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { listJourneyChecklistItems } from '@/entities/checklist/api/checklist-mutation.repository'
import { checklistQueryKeys } from '@/entities/checklist/api/checklist-query-keys'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type {
  JourneyMoment,
  JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import { JourneyStorySection } from '@/features/journeys/ui/JourneyStorySection'
import { TripSummaryLine } from '@/features/journeys/ui/TripSummaryLine'
import { NatureOnTripStrip } from '@/features/nature/ui/NatureOnTripStrip'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import { cn } from '@/shared/lib/cn'

interface JourneyOverviewProps {
  canEdit: boolean
  creatorId: string
  expandedEntryId?: string | null
  highlightEntryId?: string | null
  journey: JourneyDetail
  journeyId: string
  mapPointCount: number
  moments: JourneyMoment[]
  natureDetailOpen?: boolean
  naturePromptEntryId?: string | null
  natureGoalId?: string
  onAddMoment?: () => void
  onAddNote?: () => void
  onAddPhotos?: () => void
  onAddPlace?: () => void
  onChanged: () => void
  onExpandChange?: (entryId: string | null) => void
  onNatureDetailOpenChange?: (open: boolean) => void
  onOpenFullPage?: (entryId: string) => void
  onShowNatureOnMap?: (checklistItemId: string) => void
  photoCount: number
  publicPaths?: PublicJourneyPaths | null
  stageContents: JourneyStageContent[]
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}

export function JourneyOverview({
  canEdit,
  creatorId,
  expandedEntryId = null,
  highlightEntryId = null,
  journey,
  journeyId,
  mapPointCount,
  moments,
  natureDetailOpen,
  naturePromptEntryId = null,
  natureGoalId,
  onAddMoment,
  onAddNote,
  onAddPhotos,
  onAddPlace,
  onChanged,
  onExpandChange,
  onNatureDetailOpenChange,
  onOpenFullPage,
  onShowNatureOnMap,
  photoCount,
  publicPaths,
  stageContents,
  tagsByPhotoId,
}: JourneyOverviewProps) {
  const { t } = useTranslation()
  const checklistQuery = useQuery({
    queryFn: () => listJourneyChecklistItems(journeyId),
    queryKey: checklistQueryKeys.journey(journeyId),
  })
  const checklistItems = Array.isArray(checklistQuery.data)
    ? checklistQuery.data
    : []
  const natureChecked = checklistItems.filter(
    (item) => item.checkedAt !== null,
  ).length
  const isEmpty =
    moments.length === 0 &&
    journey.stages.length === 0 &&
    journey.stops.length === 0

  const hasWrittenSummary = journey.summary !== ''
  const summaryText = hasWrittenSummary
    ? journey.summary
    : moments.length === 0
      ? t('journey.summaryFallback')
      : null
  const summaryIsFallback = !hasWrittenSummary && summaryText !== null

  return (
    <section className="scroll-mt-24 py-6 sm:scroll-mt-20 sm:py-8">
      {summaryText === null ? null : (
        <p
          className={cn(
            'max-w-2xl text-sm leading-7 text-muted',
            summaryIsFallback && 'italic',
          )}
        >
          {summaryText}
        </p>
      )}

      <div className={cn(summaryText === null ? '' : 'mt-4')}>
        <TripSummaryLine
          mapPointCount={mapPointCount}
          momentCount={moments.length}
          natureChecked={natureChecked}
          natureTotal={checklistItems.length}
          photoCount={photoCount}
        />
      </div>

      {isEmpty && canEdit ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {onAddPhotos !== undefined ? (
            <EmptyAction
              icon={Camera}
              label={t('journey.addPhotos')}
              onClick={onAddPhotos}
            />
          ) : null}
          {onAddPlace !== undefined ? (
            <EmptyAction
              icon={MapPin}
              label={t('journey.addPlace')}
              onClick={onAddPlace}
            />
          ) : null}
          {onAddNote !== undefined ? (
            <EmptyAction
              icon={StickyNote}
              label={t('journey.addNote')}
              onClick={onAddNote}
            />
          ) : null}
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
        plannedStops={journey.stops}
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
        <div className="mt-10 scroll-mt-24 sm:scroll-mt-20" id="story">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{t('journey.moments')}</h2>
            {canEdit && onAddMoment !== undefined ? (
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 sm:hidden"
                onClick={onAddMoment}
                type="button"
              >
                <Plus aria-hidden="true" size={16} />
                {t('journey.addMoment')}
              </button>
            ) : null}
          </div>
          <JourneyStorySection
            canEdit={canEdit}
            checklistItems={checklistItems}
            creatorId={creatorId}
            expandedEntryId={expandedEntryId}
            highlightEntryId={highlightEntryId}
            journey={journey}
            journeyId={journeyId}
            moments={moments}
            naturePromptEntryId={naturePromptEntryId}
            {...(natureGoalId !== undefined ? { natureGoalId } : {})}
            onChanged={onChanged}
            {...(onExpandChange !== undefined ? { onExpandChange } : {})}
            {...(onOpenFullPage !== undefined ? { onOpenFullPage } : {})}
            {...(publicPaths !== undefined ? { publicPaths } : {})}
            stageContents={stageContents}
            tagsByPhotoId={tagsByPhotoId}
          />
        </div>
      ) : null}
    </section>
  )
}

function EmptyAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Camera
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface p-4 text-center shadow-soft transition hover:bg-white"
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" className="text-primary" size={22} />
      <span className="text-sm font-semibold">{label}</span>
    </button>
  )
}
