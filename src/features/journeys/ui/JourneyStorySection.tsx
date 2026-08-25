import { Link } from '@tanstack/react-router'
import { Circle, Leaf, Plus, Signpost } from 'lucide-react'
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
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type {
  JourneyMoment,
  JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import {
  getJourneyStageContentKey,
  getJourneyStageContentLabel,
} from '@/features/journeys/lib/journey-stage-label'
import { useJourneyMomentPhotos } from '@/features/journeys/lib/use-journey-moment-photos'
import { MomentCard } from '@/features/journeys/ui/MomentCard'
import { JourneyTimelineMoments } from '@/features/journeys/ui/JourneyTimelineMoments'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'

interface JourneyStorySectionProps {
  canEdit: boolean
  checklistItems?: JourneyChecklistItem[]
  creatorId: string
  expandedEntryId?: string | null
  highlightEntryId?: string | null
  journey: JourneyDetail
  journeyId: string
  moments: JourneyMoment[]
  naturePromptEntryId?: string | null
  natureGoalId?: string
  onChanged: () => void
  onExpandChange?: (entryId: string | null) => void
  onOpenFullPage?: (entryId: string) => void
  publicPaths?: PublicJourneyPaths | null
  stageContents: JourneyStageContent[]
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}

export function JourneyStorySection({
  canEdit,
  checklistItems = [],
  creatorId,
  expandedEntryId = null,
  highlightEntryId = null,
  journey,
  journeyId,
  moments,
  naturePromptEntryId = null,
  natureGoalId,
  onChanged,
  onExpandChange,
  onOpenFullPage,
  publicPaths,
  stageContents,
  tagsByPhotoId,
}: JourneyStorySectionProps) {
  const { t } = useTranslation()
  const { isPending, photosByEntryId } = useJourneyMomentPhotos(moments, true)

  if (moments.length === 0) {
    return (
      <div className="mt-8">
        <h3 className="reader-display text-2xl sm:text-3xl">
          {t('journey.emptyTitle')}
        </h3>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          {t('journey.emptyRoute')}
        </p>
        <Link
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
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
        <p className="mt-8 text-sm text-muted" role="status">
          {t('journey.galleryLoading')}
        </p>
      ) : null}
      <div className="mt-8 space-y-8">
        {stageContents.map((stageContent) => (
          <StageContent
            canEdit={canEdit}
            checklistItems={checklistItems}
            content={stageContent}
            creatorId={creatorId}
            expandedEntryId={expandedEntryId}
            highlightEntryId={highlightEntryId}
            journey={journey}
            key={getJourneyStageContentKey(stageContent)}
            naturePromptEntryId={naturePromptEntryId}
            {...(natureGoalId !== undefined ? { natureGoalId } : {})}
            onChanged={onChanged}
            {...(onExpandChange !== undefined ? { onExpandChange } : {})}
            {...(onOpenFullPage !== undefined ? { onOpenFullPage } : {})}
            {...(publicPaths !== undefined ? { publicPaths } : {})}
            photosByEntryId={photosByEntryId}
            tagsByPhotoId={tagsByPhotoId}
          />
        ))}
      </div>
    </>
  )
}

function StageContent({
  canEdit,
  checklistItems,
  content,
  creatorId,
  expandedEntryId,
  highlightEntryId,
  journey,
  naturePromptEntryId,
  natureGoalId,
  onChanged,
  onExpandChange,
  onOpenFullPage,
  publicPaths,
  photosByEntryId,
  tagsByPhotoId,
}: {
  canEdit: boolean
  checklistItems: JourneyChecklistItem[]
  content: JourneyStageContent
  creatorId: string
  expandedEntryId: string | null
  highlightEntryId: string | null
  journey: JourneyDetail
  naturePromptEntryId: string | null
  natureGoalId?: string
  onChanged: () => void
  onExpandChange?: (entryId: string | null) => void
  onOpenFullPage?: (entryId: string) => void
  publicPaths?: PublicJourneyPaths | null
  photosByEntryId: Map<string, PhotoPreview[]>
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}) {
  const { i18n, t } = useTranslation()
  const { genericStops, natureStops } = splitPlannedStops(
    content.plannedStops,
    checklistItems,
  )

  return (
    <section className="rounded-[1.5rem] border border-border bg-surface p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="flex items-center gap-3 text-xl font-semibold">
          <Signpost aria-hidden="true" size={18} />
          {getJourneyStageContentLabel(content, t, i18n.language)}
        </h3>
        {canEdit && content.stage !== null ? (
          <button
            className="text-sm font-semibold text-destructive"
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
      <div className="mt-6">
        <JourneyTimelineMoments
          content={content}
          moments={content.moments}
          renderMoment={(moment) => (
            <MomentCard
              canEdit={canEdit}
              creatorId={creatorId}
              expanded={expandedEntryId === moment.entry.id}
              highlighted={highlightEntryId === moment.entry.id}
              journey={journey}
              journeyId={journey.id}
              moment={moment}
              naturePrompt={naturePromptEntryId === moment.entry.id}
              {...(natureGoalId !== undefined ? { natureGoalId } : {})}
              {...(onExpandChange !== undefined ? { onExpandChange } : {})}
              {...(onOpenFullPage !== undefined ? { onOpenFullPage } : {})}
              onUpdated={onChanged}
              photos={photosByEntryId.get(moment.entry.id) ?? []}
              {...(publicPaths !== undefined ? { publicPaths } : {})}
              tagsByPhotoId={tagsByPhotoId}
            />
          )}
        />
        {natureStops.length === 0 ? null : (
          <div className="pt-3">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
              <Leaf aria-hidden="true" size={14} />
              {t('journey.plannedNatureStops')}
            </p>
            <div className="space-y-3">
              {natureStops.map((stop) => {
                const goal = checklistItemForStop(checklistItems, stop.id)
                return (
                  <article
                    className="rounded-xl border border-primary/20 bg-primary/5 p-4"
                    key={stop.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="flex items-center gap-3 font-semibold">
                        <Leaf aria-hidden="true" size={14} />
                        {goal?.title ?? stop.title}
                      </p>
                      {canEdit ? (
                        <button
                          className="text-xs font-semibold text-destructive"
                          onClick={() => {
                            if (
                              !window.confirm(t('journey.deleteStopConfirm'))
                            ) {
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
                          }}
                          type="button"
                        >
                          {t('journey.deleteStopAction')}
                        </button>
                      ) : null}
                    </div>
                    {goal?.notes === '' || goal === undefined ? null : (
                      <p className="mt-2 text-sm text-muted">{goal.notes}</p>
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        )}
        {genericStops.length === 0 ? null : (
          <div className="pt-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {t('journey.plannedPlaces')}
            </p>
            <div className="space-y-3">
              {genericStops.map((stop) => (
                <article
                  className="rounded-xl border border-dashed border-border bg-background/60 p-4"
                  key={stop.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-3 font-semibold">
                      <Circle aria-hidden="true" size={14} />
                      {stop.title}
                    </p>
                    {canEdit ? (
                      <button
                        className="text-xs font-semibold text-destructive"
                        onClick={() => {
                          if (!window.confirm(t('journey.deleteStopConfirm'))) {
                            return
                          }
                          void deleteJourneyStop(
                            creatorId,
                            journey.id,
                            stop.id,
                          ).then(onChanged)
                        }}
                        type="button"
                      >
                        {t('journey.deleteStopAction')}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
        {content.moments.length === 0 && content.plannedStops.length === 0 ? (
          <p className="text-sm text-muted">{t('journey.emptyStage')}</p>
        ) : null}
      </div>
    </section>
  )
}
