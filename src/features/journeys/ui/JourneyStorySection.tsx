import { Link } from '@tanstack/react-router'
import { Circle, Leaf, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import {
  checklistItemForStop,
  splitPlannedStops,
} from '@/entities/checklist/lib/split-planned-stops'
import { clearChecklistItemStop } from '@/entities/checklist/api/checklist-mutation.repository'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import {
  deleteJourneyStage,
  deleteJourneyStop,
} from '@/entities/journey/api/journey.repository'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type {
  JourneyMoment,
  JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import { isAutoDayGroup } from '@/features/journeys/lib/format-moment-datetime'
import {
  getJourneyStageContentKey,
  getJourneyStageContentLabel,
  shouldShowJourneyStageHeader,
} from '@/features/journeys/lib/journey-stage-label'
import { useJourneyAuthorMomentPreviews } from '@/features/journeys/lib/use-journey-author-moment-previews'
import { MomentCard } from '@/features/journeys/ui/MomentCard'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'

interface JourneyStorySectionProps {
  canEdit: boolean
  checklistItems?: JourneyChecklistItem[]
  creatorId: string
  highlightEntryId?: string | null
  journey: JourneyDetail
  journeyId: string
  moments: JourneyMoment[]
  onChanged: () => void
  onOpenMoment?: (entryId: string) => void
  publicPaths?: PublicJourneyPaths | null
  stageContents: JourneyStageContent[]
}

export function JourneyStorySection({
  canEdit,
  checklistItems = [],
  creatorId,
  highlightEntryId = null,
  journey,
  journeyId,
  moments,
  onChanged,
  onOpenMoment,
  publicPaths,
  stageContents,
}: JourneyStorySectionProps) {
  const { t } = useTranslation()
  const { isPending, photoCountsByEntry, previewsByEntry } =
    useJourneyAuthorMomentPreviews(moments, true)

  if (moments.length === 0) {
    return (
      <div className="mt-8">
        <h3 className="text-lg font-semibold">{t('journey.emptyTitle')}</h3>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
          {t('journey.emptyRoute')}
        </p>
        <Link
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
          params={{ journeyId }}
          to="/j/$journeyId/memory/new"
        >
          <Plus aria-hidden="true" size={18} />
          {t('journey.addMoment')}
        </Link>
      </div>
    )
  }

  return (
    <>
      {isPending ? (
        <p className="mt-4 text-sm text-muted" role="status">
          {t('journey.galleryLoading')}
        </p>
      ) : null}
      <div className="mt-4 space-y-8">
        {stageContents.map((stageContent) => (
          <StageGroup
            canEdit={canEdit}
            checklistItems={checklistItems}
            content={stageContent}
            creatorId={creatorId}
            highlightEntryId={highlightEntryId}
            journey={journey}
            key={getJourneyStageContentKey(stageContent)}
            onChanged={onChanged}
            {...(onOpenMoment !== undefined ? { onOpenMoment } : {})}
            photoCountsByEntry={photoCountsByEntry}
            previewsByEntry={previewsByEntry}
            {...(publicPaths !== undefined ? { publicPaths } : {})}
          />
        ))}
      </div>
    </>
  )
}

function StageGroup({
  canEdit,
  checklistItems,
  content,
  creatorId,
  highlightEntryId,
  journey,
  onChanged,
  onOpenMoment,
  photoCountsByEntry,
  previewsByEntry,
  publicPaths,
}: {
  canEdit: boolean
  checklistItems: JourneyChecklistItem[]
  content: JourneyStageContent
  creatorId: string
  highlightEntryId: string | null
  journey: JourneyDetail
  onChanged: () => void
  onOpenMoment?: (entryId: string) => void
  photoCountsByEntry: Map<string, number>
  previewsByEntry: Map<string, PhotoPreview[]>
  publicPaths?: PublicJourneyPaths | null
}) {
  const { i18n, t } = useTranslation()
  const { genericStops, natureStops } = splitPlannedStops(
    content.plannedStops,
    checklistItems,
  )
  const inDayGroup = isAutoDayGroup(content)
  const showHeader = shouldShowJourneyStageHeader(content)
  const hasMoments = content.moments.length > 0
  const hasPlanned = content.plannedStops.length > 0

  if (!hasMoments && !hasPlanned) {
    return null
  }

  return (
    <section>
      {showHeader ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-sm font-semibold text-muted">
            {getJourneyStageContentLabel(content, t, i18n.language)}
          </h3>
          {canEdit && content.stage !== null ? (
            <button
              className="shrink-0 text-xs font-semibold text-destructive"
              onClick={() => {
                const stageId = content.stage?.id
                if (stageId === undefined) {
                  return
                }
                if (!window.confirm(t('journey.deleteStageConfirm'))) {
                  return
                }
                void deleteJourneyStage(creatorId, journey.id, stageId).then(
                  onChanged,
                )
              }}
              type="button"
            >
              {t('journey.deleteStageAction')}
            </button>
          ) : null}
        </div>
      ) : null}

      {hasMoments ? (
        <div className="space-y-3">
          {content.moments.map((moment) => {
            const photoCount = photoCountsByEntry.get(moment.entry.id)
            return (
              <MomentCard
                canEdit={canEdit}
                creatorId={creatorId}
                highlighted={highlightEntryId === moment.entry.id}
                inDayGroup={inDayGroup}
                journeyId={journey.id}
                key={moment.entry.id}
                moment={moment}
                {...(onOpenMoment !== undefined
                  ? { onOpen: onOpenMoment }
                  : {})}
                onUpdated={onChanged}
                {...(photoCount !== undefined ? { photoCount } : {})}
                photos={previewsByEntry.get(moment.entry.id) ?? []}
                {...(publicPaths !== undefined ? { publicPaths } : {})}
              />
            )
          })}
        </div>
      ) : null}

      {natureStops.length === 0 ? null : (
        <div className={hasMoments ? 'mt-4 space-y-2' : 'space-y-2'}>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t('journey.plannedNatureStops')}
          </p>
          {natureStops.map((stop) => {
            const goal = checklistItemForStop(checklistItems, stop.id)
            return (
              <PlannedStopRow
                canEdit={canEdit}
                icon={Leaf}
                key={stop.id}
                {...(goal?.notes !== undefined && goal.notes !== ''
                  ? { notes: goal.notes }
                  : {})}
                {...(canEdit
                  ? {
                      onDelete: () => {
                        if (!window.confirm(t('journey.deleteStopConfirm'))) {
                          return
                        }
                        void (async () => {
                          await deleteJourneyStop(
                            creatorId,
                            journey.id,
                            stop.id,
                          )
                          if (goal !== undefined) {
                            await clearChecklistItemStop({
                              creatorId,
                              item: goal,
                              journeyId: journey.id,
                            })
                          }
                          onChanged()
                        })()
                      },
                    }
                  : {})}
                title={goal?.title ?? stop.title}
              />
            )
          })}
        </div>
      )}

      {genericStops.length === 0 ? null : (
        <div className={hasMoments ? 'mt-4 space-y-2' : 'space-y-2'}>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t('journey.plannedPlaces')}
          </p>
          {genericStops.map((stop) => (
            <PlannedStopRow
              canEdit={canEdit}
              icon={Circle}
              key={stop.id}
              {...(canEdit
                ? {
                    onDelete: () => {
                      if (!window.confirm(t('journey.deleteStopConfirm'))) {
                        return
                      }
                      void deleteJourneyStop(
                        creatorId,
                        journey.id,
                        stop.id,
                      ).then(onChanged)
                    },
                  }
                : {})}
              title={stop.title}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function PlannedStopRow({
  canEdit,
  icon: Icon,
  notes,
  onDelete,
  title,
}: {
  canEdit: boolean
  icon: typeof Circle
  notes?: string
  onDelete?: () => void
  title: string
}) {
  const { t } = useTranslation()

  return (
    <article className="flex items-start justify-between gap-3 rounded-xl border border-dashed border-border/80 bg-background/50 px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Icon aria-hidden="true" className="shrink-0 text-muted" size={14} />
          <span className="truncate">{title}</span>
        </p>
        {notes === '' || notes === undefined ? null : (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{notes}</p>
        )}
      </div>
      {canEdit && onDelete !== undefined ? (
        <button
          className="shrink-0 text-xs font-semibold text-destructive"
          onClick={onDelete}
          type="button"
        >
          {t('journey.deleteStopAction')}
        </button>
      ) : null}
    </article>
  )
}
