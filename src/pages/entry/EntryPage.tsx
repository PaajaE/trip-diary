import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { getPublicEntry } from '@/entities/entry/api/public-entry.repository'
import { PhotoGallery } from '@/features/photos/ui/PhotoGallery'
import { CopyShareLink } from '@/features/sharing'
import { shareUrl as sharePublicUrl } from '@/shared/lib/share'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'

interface EntryPageProps {
  entryId: string
  notice?: 'photos_failed'
  shareUrl?: string
}

export function EntryPage({ entryId, notice, shareUrl }: EntryPageProps) {
  const { t } = useTranslation()
  const entryQuery = useQuery({
    queryKey: ['entries', entryId],
    queryFn: async () =>
      (await getLocalEntry(entryId)) ?? getPublicEntry(entryId),
  })
  const entry = entryQuery.data

  return (
    <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-8 sm:py-16">
      {entry === undefined ? (
        <p className="mt-16 text-muted">{t('entry.loading')}</p>
      ) : entryQuery.isError ? (
        <p className="mt-16 text-destructive" role="alert">
          {t('entry.error')}
        </p>
      ) : entry === null ? (
        <p className="mt-16 text-muted">{t('entry.notFound')}</p>
      ) : (
        <article className="mt-16">
          {notice === 'photos_failed' ? (
            <p className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-900">
              {t('entry.photosFailedNotice')}
            </p>
          ) : null}
          <p className="text-sm text-accent">{t(`entry.type.${entry.type}`)}</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
            {entry.title}
          </h1>
          <p className="mt-8 whitespace-pre-wrap leading-8">{entry.body}</p>
          {shareUrl === undefined ? null : (
            <CopyShareLink
              className="mt-6"
              onCopy={() => sharePublicUrl(shareUrl, entry.title)}
            />
          )}
          <PhotoGallery alt={entry.title} entryId={entry.id} />
          <p className="mt-10 text-sm text-muted">
            {t(`entry.sync.${entry.syncStatus}`)}
          </p>
          {entry.syncStatus === 'synced' ? null : (
            <Button
              className="mt-4"
              onClick={() => {
                void syncPendingOperations().then(() => entryQuery.refetch())
              }}
              variant="secondary"
            >
              {t('entry.syncNow')}
            </Button>
          )}
        </article>
      )}
    </main>
  )
}
