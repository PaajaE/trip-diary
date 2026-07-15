import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { getPublicEntry } from '@/entities/entry/api/public-entry.repository'
import { getPublicJourney } from '@/entities/journey/api/journey.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { listPhotoTagAssignmentsForPhotos } from '@/entities/photo/api/photo-tag.repository'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
import { getEntryPhotoDetailPreviews } from '@/entities/photo/api/photo-gallery.repository'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import {
  buildAbsoluteUrl,
  buildPublicJourneyPath,
  buildPublicMomentPath,
} from '@/features/sharing/lib/public-paths'
import { groupTagsByPhotoId } from '@/features/journeys/lib/journey-tag-collections'
import { ReaderChrome } from '@/features/journeys/ui/ReaderChrome'
import { ReaderMomentPhotos } from '@/features/journeys/ui/ReaderMomentPhotos'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
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

  const previewsQuery = useQuery({
    enabled: entry !== null && entry !== undefined,
    queryFn: () => getEntryPhotoDetailPreviews(entryId),
    queryKey: entryQueryKeys.photoDetailPreviews(entryId),
  })

  const tagsQuery = useQuery({
    enabled: journeyId !== undefined && (previewsQuery.data?.length ?? 0) > 0,
    queryFn: () => {
      if (journeyId === undefined) {
        throw new Error('journeyId is required for photo tag lookup')
      }

      return listPhotoTagAssignmentsForPhotos(
        journeyId,
        (previewsQuery.data ?? []).map((preview) => preview.id),
      )
    },
    queryKey: photoQueryKeys.journeyTagsForEntry(
      journeyId ?? '',
      entryId,
      (previewsQuery.data ?? []).map((preview) => preview.id),
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

  useDocumentMeta(
    entry === null || entry === undefined
      ? null
      : {
          description: entry.body.slice(0, 160) || entry.title,
          title: entry.title,
        },
  )

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
        {(previewsQuery.data?.length ?? 0) > 0 ? (
          <ReaderMomentPhotos
            alt={title}
            entryId={entry.id}
            featured
            photos={previewsQuery.data ?? []}
            showPhotoEngagement
            tagsByPhotoId={tagsByPhotoId}
          />
        ) : null}

        <div
          className={
            (previewsQuery.data?.length ?? 0) > 0
              ? 'mx-auto w-full max-w-3xl px-5 pb-16 pt-10 sm:px-8'
              : 'mx-auto w-full max-w-3xl px-5 pb-16 pt-24 sm:px-8'
          }
        >
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

          <p className="mt-4 text-sm font-medium tracking-[0.16em] text-muted uppercase">
            {t(`entry.type.${entry.type}`)}
          </p>
          <h1 className="reader-display mt-3 text-[clamp(2rem,7vw,3.75rem)] leading-[0.98] tracking-[-0.04em]">
            {title}
          </h1>

          {entry.body === '' ? null : (
            <p className="mt-8 whitespace-pre-wrap text-lg leading-[1.85] text-foreground/90">
              {entry.body}
            </p>
          )}

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
    </div>
  )
}
