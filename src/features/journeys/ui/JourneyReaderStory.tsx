import { MapPin, Signpost } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type {
  JourneyMoment,
  JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import { ReaderMomentPhotos } from '@/features/journeys/ui/ReaderMomentPhotos'
import { cn } from '@/shared/lib/cn'

interface JourneyReaderStoryProps {
  isPhotosPending?: boolean
  onOpenEntry: (entryId: string) => void
  photosByEntryId: Map<string, PhotoPreview[]>
  stageContents: JourneyStageContent[]
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}

export function JourneyReaderStory({
  isPhotosPending = false,
  onOpenEntry,
  photosByEntryId,
  stageContents,
  tagsByPhotoId,
}: JourneyReaderStoryProps) {
  const { t } = useTranslation()
  const hasContent = stageContents.some(
    (content) => content.moments.length > 0 || content.plannedStops.length > 0,
  )

  if (!hasContent) {
    return (
      <div className="reader-empty-state mt-10">
        <h3 className="reader-display text-3xl">{t('reader.emptyTitle')}</h3>
        <p className="mt-4 max-w-xl text-base leading-8 text-muted">
          {t('reader.emptyDescription')}
        </p>
      </div>
    )
  }

  let momentIndex = 0

  return (
    <div className="mt-12 space-y-16 sm:space-y-20">
      {isPhotosPending ? (
        <p className="text-sm text-muted" role="status">
          {t('journey.galleryLoading')}
        </p>
      ) : null}
      {stageContents.map((stageContent) => (
        <section key={stageContent.stage?.id ?? 'unassigned'}>
          {shouldShowStageHeader(stageContent) ? (
            <div className="reader-stage-divider">
              <Signpost aria-hidden="true" className="text-accent" size={18} />
              <h3 className="reader-display text-2xl sm:text-3xl">
                {stageContent.stage?.title ?? t('journey.freeMoments')}
              </h3>
              {stageContent.stage?.summary === '' ? null : (
                <p className="mt-3 max-w-2xl text-base leading-8 text-muted">
                  {stageContent.stage?.summary}
                </p>
              )}
            </div>
          ) : null}

          <div
            className={cn(
              'space-y-16 sm:space-y-20',
              shouldShowStageHeader(stageContent) ? 'mt-10' : '',
            )}
          >
            {stageContent.moments.map((moment) => {
              momentIndex += 1
              return (
                <ReaderMomentArticle
                  index={momentIndex}
                  key={moment.entry.id}
                  moment={moment}
                  onOpenEntry={onOpenEntry}
                  photos={photosByEntryId.get(moment.entry.id) ?? []}
                  tagsByPhotoId={tagsByPhotoId}
                />
              )
            })}

            {stageContent.plannedStops.length === 0 ? null : (
              <div className="reader-planned-stops">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  {t('journey.plannedPlaces')}
                </p>
                <div className="mt-4 space-y-3">
                  {stageContent.plannedStops.map((stop) => (
                    <article
                      className="rounded-2xl border border-dashed border-border/80 bg-surface/70 px-5 py-4"
                      key={stop.id}
                    >
                      <p className="font-semibold">{stop.title}</p>
                      {stop.notes === '' ? null : (
                        <p className="mt-2 text-sm leading-7 text-muted">
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
  )
}

function shouldShowStageHeader(content: JourneyStageContent) {
  return content.stage !== null
}

function ReaderMomentArticle({
  index,
  moment,
  onOpenEntry,
  photos,
  tagsByPhotoId,
}: {
  index: number
  moment: JourneyMoment
  onOpenEntry: (entryId: string) => void
  photos: PhotoPreview[]
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}) {
  const { t } = useTranslation()
  const title = moment.entry.title ?? t('dashboard.untitled')
  const hasLongBody = moment.entry.body.length > 480
  const openMomentLabel =
    hasLongBody && moment.entry.body !== ''
      ? t('reader.readFullMoment')
      : t('reader.openMoment')

  return (
    <article className="reader-moment">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {t('reader.momentLabel', { index })}
          </p>
          <button
            className="reader-display mt-3 text-left text-3xl leading-tight sm:text-4xl transition-colors hover:text-accent"
            onClick={() => {
              onOpenEntry(moment.entry.id)
            }}
            type="button"
          >
            {title}
          </button>
        </div>
        {moment.location === null ? null : (
          <span
            aria-label={t('journey.hasLocation')}
            className="rounded-full bg-primary/10 p-2.5 text-primary"
          >
            <MapPin aria-hidden="true" size={16} />
          </span>
        )}
      </div>

      <ReaderMomentPhotos
        alt={title}
        entryId={moment.entry.id}
        featured
        photos={photos}
        showPhotoEngagement
        tagsByPhotoId={tagsByPhotoId}
      />

      {moment.entry.body === '' ? null : (
        <div className="mt-8">
          <p
            className={cn(
              'whitespace-pre-wrap text-lg leading-[1.85] text-foreground/90',
              hasLongBody ? 'line-clamp-[12]' : '',
            )}
          >
            {moment.entry.body}
          </p>
        </div>
      )}

      <button
        className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        onClick={() => {
          onOpenEntry(moment.entry.id)
        }}
        type="button"
      >
        {openMomentLabel}
      </button>
    </article>
  )
}
