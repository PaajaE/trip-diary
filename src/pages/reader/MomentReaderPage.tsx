import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { getPublicEntry } from '@/entities/entry/api/public-entry.repository'
import { getPublicJourney } from '@/entities/journey/api/journey.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { listPhotoTagAssignmentsForPhotos } from '@/entities/photo/api/photo-tag.repository'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
import { getPublicMomentPhotos } from '@/entities/photo/api/moment-photo-detail.repository'
import { getPhotoSrcsetSources } from '@/entities/photo/api/photo-srcset.repository'
import {
  coverObjectPositionStyle,
  normalizeCoverFocalPoint,
} from '@/entities/photo/lib/cover-focal-point'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import {
  buildAbsoluteUrl,
  buildPublicJourneyPath,
  buildPublicMomentPath,
} from '@/features/sharing/lib/public-paths'
import { groupTagsByPhotoId } from '@/features/journeys/lib/journey-tag-collections'
import { ReaderChrome } from '@/features/journeys/ui/ReaderChrome'
import { MomentCoverHero } from '@/features/journeys/ui/MomentCoverHero'
import { MomentPhotoMap } from '@/features/journeys/ui/MomentPhotoMap'
import { MomentPhotoPreview } from '@/features/journeys/ui/MomentPhotoPreview'
import {
  momentMediaColumnClass,
  momentPageClass,
  momentTextColumnClass,
} from '@/features/journeys/ui/moment-editorial-layout'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { PhotoLightbox } from '@/features/photos/ui/PhotoLightbox'
import { formatMomentDateLabel } from '@/features/journeys/lib/format-moment-datetime'
import { MetadataRow } from '@/shared/ui/MetadataRow'
import { StoryKicker } from '@/shared/ui/StoryKicker'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'
import { cn } from '@/shared/lib/cn'

interface MomentReaderPageProps {
  entryId: string
  journeyId?: string
  publicPaths?: PublicJourneyPaths
}

export function MomentReaderPage({
  entryId,
  journeyId,
  publicPaths,
}: MomentReaderPageProps) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const mapSectionRef = useRef<HTMLDivElement>(null)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [activeMapPhotoId, setActiveMapPhotoId] = useState<string | null>(null)

  const entryQuery = useQuery({
    queryFn: () => getPublicEntry(entryId),
    queryKey: entryQueryKeys.public(entryId),
  })
  const entry = entryQuery.data

  const journeyQuery = useQuery({
    enabled: journeyId !== undefined,
    queryFn: () => {
      if (journeyId === undefined) {
        throw new Error('journeyId is required')
      }
      return getPublicJourney(journeyId)
    },
    queryKey: journeyQueryKeys.publicDetail(journeyId ?? ''),
  })
  const journeyContent =
    journeyQuery.data === null || journeyQuery.data === undefined
      ? null
      : composeJourneyContent(journeyQuery.data)

  const photosQuery = useQuery({
    enabled: entry !== null && entry !== undefined,
    queryFn: () => getPublicMomentPhotos(entryId),
    queryKey: entryQueryKeys.publicMomentPhotos(entryId),
  })

  const photos = useMemo(
    () => photosQuery.data?.photos ?? [],
    [photosQuery.data?.photos],
  )
  const photoIds = photos.map((photo) => photo.id)

  const tagsQuery = useQuery({
    enabled: journeyId !== undefined && photoIds.length > 0,
    queryFn: () => {
      if (journeyId === undefined) {
        throw new Error('journeyId is required for photo tag lookup')
      }
      return listPhotoTagAssignmentsForPhotos(journeyId, photoIds)
    },
    queryKey: photoQueryKeys.journeyTagsForEntry(
      journeyId ?? '',
      entryId,
      photoIds,
    ),
  })

  const tagsByPhotoId = groupTagsByPhotoId(tagsQuery.data ?? [])

  const navigation = useMemo(() => {
    if (journeyContent === null || publicPaths === undefined) {
      return null
    }

    const moments = journeyContent.moments
    const index = moments.findIndex((moment) => moment.entry.id === entryId)
    if (index < 0) {
      return null
    }

    const previous = index > 0 ? moments[index - 1] : null
    const next = index < moments.length - 1 ? moments[index + 1] : null
    return { index: index + 1, next, previous, total: moments.length }
  }, [entryId, journeyContent, publicPaths])

  const currentMoment = useMemo(() => {
    if (journeyContent === null) {
      return null
    }
    return (
      journeyContent.moments.find((moment) => moment.entry.id === entryId) ??
      null
    )
  }, [entryId, journeyContent])

  const sharePath =
    publicPaths !== undefined &&
    entry?.slug !== null &&
    entry?.slug !== undefined
      ? buildPublicMomentPath(publicPaths, entry.slug)
      : typeof window !== 'undefined'
        ? window.location.pathname
        : ''
  const shareUrl = buildAbsoluteUrl(sharePath)
  const shareText = `${t('reader.shareMomentMessage', {
    title: entry?.title ?? t('reader.shareFallbackTitle'),
  })}\n${shareUrl}`

  const backPath =
    publicPaths !== undefined
      ? buildPublicJourneyPath(publicPaths, 'story')
      : undefined

  const coverUrl = photosQuery.data?.cover?.thumbUrl ?? null
  const coverPhotoId = photosQuery.data?.cover?.id
  const coverSrcsetQuery = useQuery({
    enabled: coverPhotoId !== undefined,
    queryFn: () => {
      if (coverPhotoId === undefined) {
        throw new Error('coverPhotoId is required')
      }
      return getPhotoSrcsetSources(coverPhotoId)
    },
    queryKey: photoQueryKeys.srcset(coverPhotoId ?? ''),
  })
  const coverFocal = normalizeCoverFocalPoint(
    photosQuery.data?.cover?.focalX,
    photosQuery.data?.cover?.focalY,
  )

  useDocumentMeta(
    entry === null || entry === undefined
      ? null
      : coverUrl !== null
        ? {
            description: entry.body.slice(0, 160) || entry.title,
            imageUrl: coverUrl,
            title: entry.title,
          }
        : {
            description: entry.body.slice(0, 160) || entry.title,
            title: entry.title,
          },
  )

  const lightboxPhotos = useMemo(
    () =>
      photos.map((photo) => {
        const previewThumb =
          photosQuery.data?.preview.find((item) => item.id === photo.id)
            ?.thumbUrl ??
          (photosQuery.data?.cover?.id === photo.id
            ? photosQuery.data.cover.thumbUrl
            : '')
        return {
          alt: entry?.title ?? t('dashboard.untitled'),
          caption: photo.caption,
          capturedAt: photo.capturedAt,
          entryId: entryId,
          id: photo.id,
          latitude: photo.latitude,
          longitude: photo.longitude,
          thumbUrl: previewThumb,
        }
      }),
    [entry?.title, entryId, photos, photosQuery.data, t],
  )

  const openGallery = useCallback(
    (photoId: string) => {
      const index = photos.findIndex((photo) => photo.id === photoId)
      setGalleryIndex(index >= 0 ? index : 0)
      setActiveMapPhotoId(photoId)
    },
    [photos],
  )

  const showPhotoOnMap = useCallback((photoId: string) => {
    setGalleryIndex(null)
    setActiveMapPhotoId(photoId)
    mapSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  }, [])

  function openSiblingMoment(slug: string | null | undefined) {
    if (publicPaths === undefined || slug === null || slug === undefined) {
      return
    }
    void navigate({
      params: {
        entrySlug: slug,
        journeySlug: publicPaths.journeySlug,
        spaceHandle: publicPaths.spaceHandle,
      },
      to: '/$spaceHandle/$journeySlug/$entrySlug',
    })
  }

  if (entryQuery.isPending) {
    return (
      <main className={cn(momentPageClass, 'px-5 py-16')}>
        <p className="text-muted">{t('entry.loading')}</p>
      </main>
    )
  }

  if (entryQuery.isError) {
    return (
      <main className={cn(momentPageClass, 'px-5 py-16')}>
        <p className="text-destructive" role="alert">
          {t('entry.error')}
        </p>
      </main>
    )
  }

  if (entry == null) {
    return (
      <main className={cn(momentPageClass, 'px-5 py-16')}>
        <p className="text-muted">{t('entry.notFound')}</p>
      </main>
    )
  }

  const title = entry.title
  const previousMoment = navigation?.previous ?? null
  const nextMoment = navigation?.next ?? null
  const hasPhotos = (photosQuery.data?.totalCount ?? 0) > 0
  const supportingPhotos =
    photosQuery.data === undefined
      ? []
      : photosQuery.data.photos.filter((photo) => photo.id !== coverPhotoId)
  const supportingPreview =
    photosQuery.data === undefined
      ? []
      : photosQuery.data.preview.filter((photo) => photo.id !== coverPhotoId)
  const previewThumbs = Object.fromEntries(
    (photosQuery.data?.preview ?? []).map((photo) => [
      photo.id,
      photo.thumbUrl,
    ]),
  )
  if (
    photosQuery.data?.cover !== null &&
    photosQuery.data?.cover !== undefined
  ) {
    previewThumbs[photosQuery.data.cover.id] = photosQuery.data.cover.thumbUrl
  }

  return (
    <div className="reader-page pb-16 pt-16">
      {publicPaths !== undefined ? (
        <ReaderChrome
          {...(backPath === undefined
            ? {}
            : { backHref: backPath, backLabel: t('reader.backToTrip') })}
          shareText={shareText}
          shareUrl={shareUrl}
          title={title}
          variant="toolbar"
        />
      ) : null}

      <article className={cn(momentPageClass, 'px-5 sm:px-8')}>
        {coverUrl !== null ? (
          <div className={momentMediaColumnClass}>
            <MomentCoverHero
              alt={t('reader.openCoverPhoto')}
              className="mt-6"
              focalStyle={coverObjectPositionStyle(coverFocal, 'center 32%')}
              onClick={() => {
                const coverId = photosQuery.data?.cover?.id
                if (coverId !== undefined) {
                  openGallery(coverId)
                }
              }}
              src={coverUrl}
              {...(coverSrcsetQuery.data !== undefined &&
              coverSrcsetQuery.data.length > 0
                ? { srcSetSources: coverSrcsetQuery.data }
                : {})}
            />
          </div>
        ) : null}

        <div
          className={cn(
            momentTextColumnClass,
            coverUrl === null ? 'pt-6' : 'mt-8',
          )}
        >
          {navigation !== null ? (
            <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-muted uppercase">
              {t('reader.momentProgress', {
                current: navigation.index,
                total: navigation.total,
              })}
            </p>
          ) : null}

          <StoryKicker className="mt-3">
            {t(`entry.type.${entry.type}`)}
          </StoryKicker>
          <h1 className="reader-display mt-3 text-[clamp(1.85rem,5vw,3.15rem)] leading-[1.05] tracking-[-0.04em]">
            {title}
          </h1>
          <MetadataRow
            className="mt-4"
            items={[
              {
                icon: CalendarDays,
                label:
                  formatMomentDateLabel(entry.eventAt, i18n.language) ?? '',
              },
              {
                icon: MapPin,
                label:
                  currentMoment?.stop == null
                    ? ''
                    : currentMoment.stop.title.trim() === title.trim()
                      ? ''
                      : currentMoment.stop.title,
              },
            ]}
          />

          {entry.body === '' ? (
            hasPhotos ? (
              <p className="mt-8 text-base leading-relaxed text-muted">
                {t('reader.shortMomentHint')}
              </p>
            ) : null
          ) : (
            <div className="prose-reader mt-8 whitespace-pre-wrap text-lg leading-[1.8] text-foreground/90">
              {entry.body}
            </div>
          )}
        </div>

        {photosQuery.data !== undefined && photosQuery.data.totalCount > 0 ? (
          <div className={cn(momentMediaColumnClass, 'mt-10')}>
            <MomentPhotoPreview
              onOpenGallery={openGallery}
              photos={supportingPhotos}
              preview={supportingPreview}
              totalCount={photosQuery.data.totalCount}
            />
          </div>
        ) : null}

        <div
          className={cn(momentMediaColumnClass, 'mt-10')}
          ref={mapSectionRef}
        >
          <MomentPhotoMap
            activePhotoId={activeMapPhotoId}
            onSelectPhoto={openGallery}
            photos={photos}
            primaryLocation={currentMoment?.location ?? null}
            thumbUrls={previewThumbs}
          />
        </div>

        {navigation !== null ? (
          <nav
            aria-label={t('reader.momentNavigation')}
            className={cn(
              momentTextColumnClass,
              'mt-12 flex gap-4 border-t border-border/60 pt-8',
            )}
          >
            {previousMoment !== null && previousMoment.entry.slug !== null ? (
              <button
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => {
                  openSiblingMoment(previousMoment.entry.slug)
                }}
                type="button"
              >
                <ChevronLeft
                  aria-hidden="true"
                  className="shrink-0"
                  size={18}
                />
                <span className="min-w-0">
                  <span className="block text-xs tracking-wide text-muted">
                    {t('reader.previousMoment')}
                  </span>
                  <span className="block truncate font-semibold">
                    {previousMoment.entry.title ?? t('dashboard.untitled')}
                  </span>
                </span>
              </button>
            ) : (
              <span className="flex-1" />
            )}
            {nextMoment !== null && nextMoment.entry.slug !== null ? (
              <button
                className="flex min-h-11 min-w-0 flex-1 items-center justify-end gap-2 text-right"
                onClick={() => {
                  openSiblingMoment(nextMoment.entry.slug)
                }}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block text-xs tracking-wide text-muted">
                    {t('reader.nextMoment')}
                  </span>
                  <span className="block truncate font-semibold">
                    {nextMoment.entry.title ?? t('dashboard.untitled')}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="shrink-0"
                  size={18}
                />
              </button>
            ) : null}
          </nav>
        ) : null}

        <ContentEngagement
          className={cn(
            momentTextColumnClass,
            'mt-10 border-t border-border/30 pt-5',
          )}
          collapsibleComposer
          compact
          target={{ id: entry.id, type: 'entry' }}
        />
      </article>

      {galleryIndex !== null && lightboxPhotos.length > 0 ? (
        <PhotoLightbox
          initialIndex={galleryIndex}
          onClose={() => {
            setGalleryIndex(null)
          }}
          onShowOnMap={showPhotoOnMap}
          photoEngagement
          photos={lightboxPhotos}
          tagsByPhotoId={tagsByPhotoId}
        />
      ) : null}
    </div>
  )
}
