import { MapPin, Signpost } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type {
  JourneyMoment,
  JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import { useJourneyMomentPhotos } from '@/features/journeys/lib/use-journey-moment-photos'
import { EntryPhotoGrid } from '@/features/photos/ui/EntryPhotoGrid'

interface JourneyReaderStoryProps {
  onOpenEntry: (entryId: string) => void
  stageContents: JourneyStageContent[]
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}

export function JourneyReaderStory({
  onOpenEntry,
  stageContents,
  tagsByPhotoId,
}: JourneyReaderStoryProps) {
  const { t } = useTranslation()
  const moments = useMemo(
    () => stageContents.flatMap((content) => content.moments),
    [stageContents],
  )
  const { isPending, photosByEntryId } = useJourneyMomentPhotos(moments, true)
  const hasContent = stageContents.some(
    (content) => content.moments.length > 0 || content.plannedStops.length > 0,
  )

  if (!hasContent) {
    return (
      <div className="mt-8 rounded-[1.5rem] border border-dashed border-border bg-surface p-6 shadow-soft">
        <h3 className="text-xl font-semibold">{t('reader.emptyTitle')}</h3>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          {t('reader.emptyDescription')}
        </p>
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
          <section
            className="rounded-[1.5rem] border border-border bg-surface p-5 shadow-soft sm:p-6"
            key={stageContent.stage?.id ?? 'unassigned'}
          >
            {shouldShowStageHeader(stageContent) ? (
              <h3 className="flex items-center gap-3 text-xl font-semibold">
                <Signpost aria-hidden="true" size={18} />
                {stageContent.stage?.title ?? t('journey.freeMoments')}
              </h3>
            ) : null}
            <div
              className={
                shouldShowStageHeader(stageContent)
                  ? 'mt-6 space-y-4'
                  : 'space-y-4'
              }
            >
              {stageContent.moments.map((moment) => (
                <ReaderMomentCard
                  key={moment.entry.id}
                  moment={moment}
                  onOpenEntry={onOpenEntry}
                  photos={photosByEntryId.get(moment.entry.id) ?? []}
                  tagsByPhotoId={tagsByPhotoId}
                />
              ))}
              {stageContent.plannedStops.length === 0 ? null : (
                <div className="pt-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {t('journey.plannedPlaces')}
                  </p>
                  <div className="space-y-3">
                    {stageContent.plannedStops.map((stop) => (
                      <article
                        className="rounded-xl border border-dashed border-border bg-background/60 p-4"
                        key={stop.id}
                      >
                        <p className="font-semibold">{stop.title}</p>
                        {stop.notes === '' ? null : (
                          <p className="mt-2 text-sm leading-6 text-muted">
                            {stop.notes}
                          </p>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

function shouldShowStageHeader(content: JourneyStageContent) {
  if (content.stage === null) {
    return false
  }
  return true
}

function ReaderMomentCard({
  moment,
  onOpenEntry,
  photos,
  tagsByPhotoId,
}: {
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
        <p className="mt-3 line-clamp-4 leading-7 text-muted">
          {moment.entry.body}
        </p>
      )}
      <EntryPhotoGrid
        alt={title}
        entryId={moment.entry.id}
        onOpenMoment={onOpenEntry}
        photos={photos}
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
