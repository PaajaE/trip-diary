import { CalendarDays, ChevronRight, MapPin, Signpost } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type {
  JourneyMoment,
  JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import { excerptText } from '@/features/journeys/lib/excerpt-text'
import {
  formatMomentDateLabel,
  isAutoDayGroup,
} from '@/features/journeys/lib/format-moment-datetime'
import {
  getJourneyStageContentKey,
  getJourneyStageContentLabel,
  shouldShowJourneyStageHeader,
} from '@/features/journeys/lib/journey-stage-label'
import { JourneyTimelineMoments } from '@/features/journeys/ui/JourneyTimelineMoments'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { usePhotoLightbox } from '@/features/photos/lib/use-photo-lightbox'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PhotoPreviewStrip } from '@/shared/ui/PhotoPreviewStrip'
import { StoryKicker } from '@/shared/ui/StoryKicker'
import { cn } from '@/shared/lib/cn'

const CARD_PHOTO_LIMIT = 5

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
      <EmptyState
        className="mt-8"
        description={t('reader.emptyDescription')}
        title={t('reader.emptyTitle')}
      />
    )
  }

  return (
    <div className="mt-8 space-y-12 sm:space-y-14">
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
              <div className="mb-6 flex items-start gap-3 sm:mb-8">
                <Signpost
                  aria-hidden="true"
                  className="mt-1 text-accent"
                  size={18}
                />
                <div>
                  <h3
                    className="reader-display text-2xl sm:text-3xl"
                    id={stageHeaderId}
                  >
                    {stageLabel}
                  </h3>
                  {stageContent.stage?.summary === '' ? null : (
                    <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
                      {stageContent.stage?.summary}
                    </p>
                  )}
                </div>
              </div>
            )}

            <JourneyTimelineMoments
              className={cn(
                'journey-timeline--reader',
                isAutoDayGroup(stageContent) &&
                  stageContent.moments.length === 1
                  ? 'journey-timeline--reader-quiet'
                  : '',
              )}
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
  const { i18n, t } = useTranslation()
  const title = moment.entry.title ?? t('dashboard.untitled')
  const excerpt = excerptText(moment.entry.body)
  const previewPhotos = photos.slice(0, CARD_PHOTO_LIMIT)
  const urls = usePhotoObjectUrls(previewPhotos)
  const overflowCount = Math.max(0, photos.length - CARD_PHOTO_LIMIT)
  const cover = urls[0]
  const stripPhotos = urls.slice(1)
  const titleId = `reader-moment-title-${moment.entry.id}`
  const dateLabel = formatMomentDateLabel(moment.entry.eventAt, i18n.language)
  const stopTitle = moment.stop?.title.trim() ?? ''
  const locationLabel =
    stopTitle === '' || stopTitle === title.trim() ? null : stopTitle
  const { lightboxElement, openLightbox } = usePhotoLightbox({
    photoEngagement: true,
    tagsByPhotoId,
  })

  const lightboxPhotos = urls.map((preview) => ({
    alt: title,
    entryId: moment.entry.id,
    id: preview.id,
    ...(preview.mediaType === 'video' ? { mediaType: 'video' as const } : {}),
    thumbUrl: preview.url,
  }))

  function openPhoto(photoId: string) {
    const photoIndex = lightboxPhotos.findIndex((photo) => photo.id === photoId)
    openLightbox(lightboxPhotos, photoIndex >= 0 ? photoIndex : 0)
  }

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'reader-moment-card group relative',
        active ? 'reader-moment-card--active' : '',
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

      <div
        className={cn(
          'reader-moment-card__layout',
          cover !== undefined ? 'reader-moment-card__layout--split' : '',
        )}
      >
        {cover === undefined ? (
          photos.length > 0 ? (
            <div
              aria-hidden="true"
              className="reader-moment-card__cover reader-photo-placeholder"
            />
          ) : null
        ) : (
          <div className="reader-moment-card__cover relative z-[2]">
            <button
              aria-label={title}
              className="block size-full"
              onClick={() => {
                openPhoto(cover.id)
              }}
              type="button"
            >
              <img
                alt=""
                className="size-full object-cover"
                decoding="async"
                loading="lazy"
                src={cover.url}
              />
              {cover.mediaType === 'video' ? <VideoPlayOverlay /> : null}
            </button>
          </div>
        )}

        <div className="reader-moment-card__copy">
          <div className="pointer-events-none relative z-[1]">
            <StoryKicker>{t(`entry.type.${moment.entry.type}`)}</StoryKicker>
            <h4
              className="reader-display mt-2 text-2xl leading-tight sm:text-[1.85rem]"
              id={titleId}
            >
              {title}
            </h4>
            {dateLabel === null && locationLabel === null ? (
              <p className="mt-2 text-sm text-muted">
                {t('reader.momentLabel', { index })}
              </p>
            ) : (
              <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                {dateLabel === null ? null : (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays aria-hidden="true" size={14} />
                    {dateLabel}
                  </span>
                )}
                {locationLabel === null ? null : (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin aria-hidden="true" size={14} />
                    {locationLabel}
                  </span>
                )}
              </p>
            )}
            {excerpt === '' ? null : (
              <p className="mt-3 line-clamp-3 text-base leading-7 text-foreground/85">
                {excerpt}
              </p>
            )}
          </div>

          {stripPhotos.length > 0 ? (
            <div className="relative z-[2] mt-4">
              <PhotoPreviewStrip
                onSelect={openPhoto}
                overflowCount={overflowCount}
                overflowLabel={t('reader.morePhotosCountMany', {
                  count: overflowCount,
                })}
                photos={stripPhotos.map((photo) => ({
                  alt: title,
                  id: photo.id,
                  url: photo.url,
                  ...(photo.mediaType === 'video'
                    ? { mediaType: 'video' as const }
                    : {}),
                  ...(typeof photo.height === 'number'
                    ? { height: photo.height }
                    : {}),
                  ...(typeof photo.width === 'number'
                    ? { width: photo.width }
                    : {}),
                }))}
              />
            </div>
          ) : null}

          <div className="relative z-[2] mt-auto pt-3">
            <ContentEngagement
              countsOnly
              target={{ id: moment.entry.id, type: 'entry' }}
            />
          </div>

          <p
            aria-hidden="true"
            className="reader-moment-card__action-hint pointer-events-none relative z-[1] mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
          >
            <span>{t('reader.openMoment')}</span>
            <ChevronRight aria-hidden="true" size={16} />
          </p>
        </div>
      </div>
      {lightboxElement}
    </article>
  )
}
