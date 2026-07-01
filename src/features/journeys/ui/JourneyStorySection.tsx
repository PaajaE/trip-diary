import { Link } from '@tanstack/react-router'
import { Circle, Leaf, MapPin, Plus, Signpost } from 'lucide-react'
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
import { useJourneyMomentPhotos } from '@/features/journeys/lib/use-journey-moment-photos'
import { EntryPhotoGrid } from '@/features/photos/ui/EntryPhotoGrid'

interface JourneyStorySectionProps {
  canEdit: boolean
  checklistItems?: JourneyChecklistItem[]
  creatorId: string
  journey: JourneyDetail
  journeyId: string
  moments: JourneyMoment[]
  onChanged: () => void
  onOpenEntry: (entryId: string) => void
  stageContents: JourneyStageContent[]
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}

export function JourneyStorySection({
  canEdit,
  checklistItems = [],
  creatorId,
  journey,
  journeyId,
  moments,
  onChanged,
  onOpenEntry,
  stageContents,
  tagsByPhotoId,
}: JourneyStorySectionProps) {
  const { t } = useTranslation()
  const { isPending, photosByEntryId } = useJourneyMomentPhotos(moments, true)

  if (moments.length === 0) {
    return (
      <div className="mt-8 rounded-[1.5rem] border border-dashed border-border bg-surface p-6 shadow-soft">
        <h3 className="text-xl font-semibold">{t('journey.emptyTitle')}</h3>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          {t('journey.emptyRoute')}
        </p>
        <Link
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
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
            journey={journey}
            key={stageContent.stage?.id ?? 'unassigned'}
            onChanged={onChanged}
            onOpenEntry={onOpenEntry}
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
  journey,
  onChanged,
  onOpenEntry,
  photosByEntryId,
  tagsByPhotoId,
}: {
  canEdit: boolean
  checklistItems: JourneyChecklistItem[]
  content: JourneyStageContent
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
  onOpenEntry: (entryId: string) => void
  photosByEntryId: Map<string, PhotoPreview[]>
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}) {
  const { t } = useTranslation()
  const { genericStops, natureStops } = splitPlannedStops(
    content.plannedStops,
    checklistItems,
  )

  return (
    <section className="rounded-[1.5rem] border border-border bg-surface p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="flex items-center gap-3 text-xl font-semibold">
          <Signpost aria-hidden="true" size={18} />
          {content.stage?.title ?? t('journey.freeMoments')}
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
      <div className="mt-6 space-y-4">
        {content.moments.map((moment) => (
          <MomentCard
            canEdit={canEdit}
            creatorId={creatorId}
            journey={journey}
            key={moment.entry.id}
            moment={moment}
            onOpenEntry={onOpenEntry}
            photos={photosByEntryId.get(moment.entry.id) ?? []}
            tagsByPhotoId={tagsByPhotoId}
          />
        ))}
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

function MomentCard({
  canEdit,
  creatorId,
  journey,
  moment,
  onOpenEntry,
  photos,
  tagsByPhotoId,
}: {
  canEdit: boolean
  creatorId: string
  journey: JourneyDetail
  moment: JourneyMoment
  onOpenEntry: (entryId: string) => void
  photos: PhotoPreview[]
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}) {
  const { t } = useTranslation()
  const title = moment.entry.title ?? t('dashboard.untitled')

  return (
    <article className="overflow-hidden rounded-2xl border border-border/80 bg-background/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            {t(`entry.type.${moment.entry.type}`)}
          </p>
          <h4 className="mt-2 text-lg font-semibold">{title}</h4>
        </div>
        {moment.location === null ? null : (
          <span
            aria-label={t('journey.hasLocation')}
            className="rounded-full bg-primary/10 p-2 text-primary"
          >
            <MapPin aria-hidden="true" size={16} />
          </span>
        )}
      </div>
      {moment.entry.body === '' ? null : (
        <p className="mt-3 line-clamp-3 leading-7 text-muted">
          {moment.entry.body}
        </p>
      )}
      <EntryPhotoGrid
        alt={title}
        canDelete={canEdit}
        canEditTags={canEdit}
        creatorId={creatorId}
        entryId={moment.entry.id}
        journeyId={journey.id}
        onOpenMoment={onOpenEntry}
        photos={photos}
        showPhotoEngagement
        tagsByPhotoId={tagsByPhotoId}
      />
      <button
        className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        onClick={() => {
          onOpenEntry(moment.entry.id)
        }}
        type="button"
      >
        {t('journey.openMoment')}
      </button>
    </article>
  )
}
