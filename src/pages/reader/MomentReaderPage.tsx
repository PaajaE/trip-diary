import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { getPublicEntry } from '@/entities/entry/api/public-entry.repository'
import { getPublicJourney } from '@/entities/journey/api/journey.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { listPhotoTagAssignmentsForPhotos } from '@/entities/photo/api/photo-tag.repository'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
import { getPublicMomentPhotos } from '@/entities/photo/api/moment-photo-detail.repository'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import {
  buildAbsoluteUrl,
  buildPublicJourneyPath,
  buildPublicMomentPath,
} from '@/features/sharing/lib/public-paths'
import { groupTagsByPhotoId } from '@/features/journeys/lib/journey-tag-collections'
import { ReaderChrome } from '@/features/journeys/ui/ReaderChrome'
import { MomentPhotoMap } from '@/features/journeys/ui/MomentPhotoMap'
import { MomentPhotoPreview } from '@/features/journeys/ui/MomentPhotoPreview'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { PhotoLightbox } from '@/features/photos/ui/PhotoLightbox'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'

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
  const { t } = useTranslation()
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
      <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-16">
        <p className="text-muted">{t('entry.loading')}</p>
      </main>
    )
  }

  if (entryQuery.isError) {
    return (
      <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-16">
        <p className="text-destructive" role="alert">
          {t('entry.error')}
        </p>
      </main>
    )
  }

  if (entry == null) {
    return (
      <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-16">
        <p className="text-muted">{t('entry.notFound')}</p>
      </main>
    )
  }

  const title = entry.title
  const previousMoment = navigation?.previous ?? null
  const nextMoment = navigation?.next ?? null
  const hasPhotos = (photosQuery.data?.totalCount ?? 0) > 0
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
    <div className="reader-page pb-16">
      {publicPaths !== undefined ? (
        <ReaderChrome
          shareText={shareText}
          shareUrl={shareUrl}
          spaceHandle={publicPaths.spaceHandle}
          title={title}
        />
      ) : null}

      <article>
        {coverUrl !== null ? (
          <div className="reader-bleed relative mt-8">
            <button
              aria-label={t('reader.openCoverPhoto')}
              className="reader-photo-feature block w-full overflow-hidden"
              onClick={() => {
                const coverId = photosQuery.data?.cover?.id
                if (coverId !== undefined) {
                  openGallery(coverId)
                }
              }}
              type="button"
            >
              <img
                alt=""
                className="size-full object-cover"
                decoding="async"
                fetchPriority="high"
                loading="eager"
                src={coverUrl}
              />
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-5 pb-6 pt-16 sm:px-8">
              <p className="text-xs font-semibold tracking-[0.2em] text-white/80 uppercase">
                {t(`entry.type.${entry.type}`)}
              </p>
              <h1 className="reader-display mt-2 max-w-3xl text-[clamp(1.85rem,6vw,3.25rem)] leading-[0.98] tracking-[-0.04em] text-white">
                {title}
              </h1>
            </div>
          </div>
        ) : (
          <div className="reader-bleed reader-hero-fallback mt-8 px-5 py-16 sm:px-8">
            <div className="mx-auto w-full max-w-3xl">
              <p className="text-xs font-semibold tracking-[0.2em] text-white/75 uppercase">
                {t(`entry.type.${entry.type}`)}
              </p>
              <h1 className="reader-display mt-3 text-[clamp(2rem,7vw,3.75rem)] leading-[0.98] tracking-[-0.04em] text-white">
                {title}
              </h1>
            </div>
          </div>
        )}

        <div className="mx-auto w-full max-w-3xl px-5 pb-16 pt-10 sm:px-8">
          {backPath !== undefined ? (
            <Link
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
              to={backPath}
            >
              <ArrowLeft aria-hidden="true" size={16} />
              {t('reader.backToTrip')}
            </Link>
          ) : null}

          {navigation !== null ? (
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              {t('reader.momentProgress', {
                current: navigation.index,
                total: navigation.total,
              })}
            </p>
          ) : null}

          {coverUrl === null ? null : (
            <p className="mt-4 text-sm font-medium tracking-[0.16em] text-muted uppercase">
              {t(`entry.type.${entry.type}`)}
            </p>
          )}

          {entry.body === '' ? (
            hasPhotos ? (
              <p className="mt-8 text-base leading-relaxed text-muted">
                {t('reader.shortMomentHint')}
              </p>
            ) : null
          ) : (
            <div className="reader-story prose-reader mt-8 max-w-[40rem] whitespace-pre-wrap text-lg leading-[1.85] text-foreground/90">
              {entry.body}
            </div>
          )}

          {photosQuery.data !== undefined && photosQuery.data.totalCount > 0 ? (
            <MomentPhotoPreview
              onOpenGallery={openGallery}
              photos={photosQuery.data.photos}
              preview={photosQuery.data.preview}
              totalCount={photosQuery.data.totalCount}
            />
          ) : null}

          <div ref={mapSectionRef}>
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
              className="mt-12 grid gap-3 border-t border-border/70 pt-10 sm:grid-cols-2"
            >
              {previousMoment !== null && previousMoment.entry.slug !== null ? (
                <button
                  className="reader-moment-nav flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 text-left transition hover:bg-background"
                  onClick={() => {
                    openSiblingMoment(previousMoment.entry.slug)
                  }}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" size={18} />
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-muted">
                      {t('reader.previousMoment')}
                    </span>
                    <span className="font-semibold">
                      {previousMoment.entry.title ?? t('dashboard.untitled')}
                    </span>
                  </span>
                </button>
              ) : (
                <span />
              )}
              {nextMoment !== null && nextMoment.entry.slug !== null ? (
                <button
                  className="reader-moment-nav flex min-h-14 items-center justify-end gap-3 rounded-2xl border border-border bg-surface px-4 text-right transition hover:bg-background sm:col-start-2"
                  onClick={() => {
                    openSiblingMoment(nextMoment.entry.slug)
                  }}
                  type="button"
                >
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-muted">
                      {t('reader.nextMoment')}
                    </span>
                    <span className="font-semibold">
                      {nextMoment.entry.title ?? t('dashboard.untitled')}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              ) : null}
            </nav>
          ) : null}

          <ContentEngagement
            className="mt-12 rounded-[1.75rem] border border-border bg-surface p-5 shadow-soft sm:p-6"
            target={{ id: entry.id, type: 'entry' }}
          />
        </div>
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
