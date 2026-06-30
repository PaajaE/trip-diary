import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getPublicEntry } from '@/entities/entry/api/public-entry.repository'
import { listPhotoTagAssignmentsForPhotos } from '@/entities/photo/api/photo-tag.repository'
import { getEntryPhotoPreviews } from '@/entities/photo/api/photo-gallery.repository'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import {
  buildAbsoluteUrl,
  buildPublicJourneyPath,
  buildPublicMomentPath,
} from '@/features/sharing/lib/public-paths'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { ShareActions } from '@/features/sharing/ui/ShareActions'
import { PhotoGallery } from '@/features/photos/ui/PhotoGallery'
import { PhotoTagList } from '@/features/photos/ui/PhotoTagList'
import { groupTagsByPhotoId } from '@/features/journeys/lib/journey-tag-collections'
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
  const entryQuery = useQuery({
    queryFn: () => getPublicEntry(entryId),
    queryKey: ['entries', entryId, 'public'],
  })
  const entry = entryQuery.data

  const previewsQuery = useQuery({
    enabled: entry !== null && entry !== undefined,
    queryFn: () => getEntryPhotoPreviews(entryId),
    queryKey: ['entries', entryId, 'photo-previews'],
  })

  const tagsQuery = useQuery({
    enabled: journeyId !== undefined && (previewsQuery.data?.length ?? 0) > 0,
    queryFn: () =>
      listPhotoTagAssignmentsForPhotos(
        journeyId!,
        (previewsQuery.data ?? []).map((preview) => preview.id),
      ),
    queryKey: [
      'journey-photo-tags',
      journeyId,
      'entry',
      entryId,
      ...(previewsQuery.data ?? []).map((preview) => preview.id),
    ],
  })

  const tagsByPhotoId = groupTagsByPhotoId(tagsQuery.data ?? [])
  const allTags = tagsQuery.data ?? []

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

  return (
    <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-8 sm:py-16">
      {backPath !== undefined ? (
        <Link
          className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
          to={backPath}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          {t('reader.backToTrip')}
        </Link>
      ) : null}

      {entryQuery.isPending ? (
        <p className="mt-16 text-muted">{t('entry.loading')}</p>
      ) : entryQuery.isError ? (
        <p className="mt-16 text-destructive" role="alert">
          {t('entry.error')}
        </p>
      ) : entry == null ? (
        <p className="mt-16 text-muted">{t('entry.notFound')}</p>
      ) : (
        <article className={backPath === undefined ? 'mt-16' : 'mt-8'}>
          <p className="text-sm text-accent">{t(`entry.type.${entry.type}`)}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
            {entry.title}
          </h1>
          {entry.body === '' ? null : (
            <p className="mt-8 whitespace-pre-wrap leading-8">{entry.body}</p>
          )}
          <ShareActions
            className="mt-6"
            shareText={shareText}
            shareUrl={shareUrl}
            title={entry.title}
          />
          {allTags.length > 0 ? (
            <PhotoTagList className="mt-6" tags={allTags} />
          ) : null}
          <PhotoGallery
            alt={entry.title}
            entryId={entry.id}
            showEmpty
            showPhotoEngagement
            tagsByPhotoId={tagsByPhotoId}
          />
          <ContentEngagement
            className="mt-10 border-t border-border/70 pt-10"
            target={{ id: entry.id, type: 'entry' }}
          />
        </article>
      )}
    </main>
  )
}
