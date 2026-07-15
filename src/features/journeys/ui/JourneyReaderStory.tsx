import { ChevronRight, MapPin, Signpost } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type {
  JourneyMoment,
  JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import {
  getJourneyStageContentKey,
  getJourneyStageContentLabel,
  shouldShowJourneyStageHeader,
} from '@/features/journeys/lib/journey-stage-label'
import { ReaderMomentPhotos } from '@/features/journeys/ui/ReaderMomentPhotos'
import { JourneyTimelineMoments } from '@/features/journeys/ui/JourneyTimelineMoments'
import { cn } from '@/shared/lib/cn'

interface JourneyReaderStoryProps {
  activeMomentId?: string | null
  onOpenEntry: (entryId: string) => void
  photosByEntryId: Map<string, PhotoPreview[]>
  stageContents: JourneyStageContent[]
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}

export function JourneyReaderStory({
  activeMomentId = null,
  onOpenEntry,
  photosByEntryId,
  stageContents,
  tagsByPhotoId,
}: JourneyReaderStoryProps) {
  const { i18n, t } = useTranslation()
  const hasContent = stageContents.some((content) => content.moments.length > 0)

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

  return (
    <div className="mt-10 space-y-14 sm:space-y-16">
      {stageContents.map((stageContent, stageIndex) => {
        if (stageContent.moments.length === 0) {
          return null
        }

        const momentOffset = stageContents
          .slice(0, stageIndex)
          .reduce((sum, content) => sum + content.moments.length, 0)
        const stageLabel = shouldShowJourneyStageHeader(stageContent)
          ? getJourneyStageContentLabel(stageContent, t, i18n.language)
          : null
        const stageHeaderId =
          stageLabel === null
            ? undefined
            : `reader-stage-${getJourneyStageContentKey(stageContent)}`

        return (
          <section
            aria-labelledby={stageHeaderId}
            key={getJourneyStageContentKey(stageContent)}
          >
            {stageLabel === null ? null : (
              <div className="reader-stage-divider">
                <Signpost
                  aria-hidden="true"
                  className="text-accent"
                  size={18}
                />
                <h3
                  className="reader-display text-2xl sm:text-3xl"
                  id={stageHeaderId}
                >
                  {stageLabel}
                </h3>
                {stageContent.stage?.summary === '' ? null : (
                  <p className="mt-3 max-w-2xl text-base leading-8 text-muted">
                    {stageContent.stage?.summary}
                  </p>
                )}
              </div>
            )}

            <div className={cn(stageLabel === null ? '' : 'mt-8 sm:mt-10')}>
              <JourneyTimelineMoments
                className="journey-timeline--reader"
                content={stageContent}
                itemClassName="journey-timeline__item--reader-card"
                moments={stageContent.moments}
                renderMoment={(moment, index) => (
                  <ReaderMomentArticle
                    active={activeMomentId === moment.entry.id}
                    index={momentOffset + index + 1}
                    key={moment.entry.id}
                    moment={moment}
                    onOpenEntry={onOpenEntry}
                    photos={photosByEntryId.get(moment.entry.id) ?? []}
                    tagsByPhotoId={tagsByPhotoId}
                  />
                )}
              />
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function ReaderMomentArticle({
  active = false,
  index,
  moment,
  onOpenEntry,
  photos,
  tagsByPhotoId,
}: {
  active?: boolean
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
  const eyebrowLabel =
    moment.entry.eventAt === null
      ? t('reader.momentLabel', { index })
      : t(`entry.type.${moment.entry.type}`)
  const titleId = `reader-moment-title-${moment.entry.id}`

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'reader-moment-card group relative rounded-[1.5rem] border bg-surface/80 p-5 shadow-soft transition sm:p-6',
        active
          ? 'reader-moment-card--active border-primary/50 ring-2 ring-primary/15'
          : 'border-border/70 hover:border-border hover:bg-surface',
      )}
    >
      <button
        aria-label={t('reader.openMomentCard', { title })}
        className="reader-moment-card__hit-target"
        onClick={() => {
          onOpenEntry(moment.entry.id)
        }}
        type="button"
      />

      <div className="reader-moment-card__body pointer-events-none relative z-[1]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              {eyebrowLabel}
            </p>
            <h4
              className="reader-display mt-3 text-3xl leading-tight sm:text-4xl"
              id={titleId}
            >
              {title}
            </h4>
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
      </div>

      <div className="reader-moment-card__media relative z-[2]">
        <ReaderMomentPhotos
          alt={title}
          entryId={moment.entry.id}
          featured
          photos={photos}
          showPhotoEngagement
          tagsByPhotoId={tagsByPhotoId}
        />
      </div>

      <div className="reader-moment-card__body pointer-events-none relative z-[1]">
        {moment.entry.body === '' ? null : (
          <div className="mt-6">
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

        <p
          aria-hidden="true"
          className="reader-moment-card__action-hint mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
        >
          <span>{openMomentLabel}</span>
          <ChevronRight aria-hidden="true" size={16} />
        </p>
      </div>
    </article>
  )
}
