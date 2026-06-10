import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { getPublicEntry } from '@/entities/entry/api/public-entry.repository'
import { PhotoGallery } from '@/features/photos/ui/PhotoGallery'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'

interface EntryPageProps {
  entryId: string
}

export function EntryPage({ entryId }: EntryPageProps) {
  const { t } = useTranslation()
  const entryQuery = useQuery({
    queryKey: ['entries', entryId],
    queryFn: async () =>
      (await getLocalEntry(entryId)) ?? getPublicEntry(entryId),
  })

  return (
    <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-8 sm:py-16">
      {entryQuery.isPending ? (
        <p className="mt-16 text-muted">{t('entry.loading')}</p>
      ) : entryQuery.isError ? (
        <p className="mt-16 text-destructive" role="alert">
          {t('entry.error')}
        </p>
      ) : entryQuery.data === null ? (
        <p className="mt-16 text-muted">{t('entry.notFound')}</p>
      ) : (
        <article className="mt-16">
          <p className="text-sm text-accent">
            {t(`entry.type.${entryQuery.data.type}`)}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em]">
            {entryQuery.data.title}
          </h1>
          <p className="mt-8 whitespace-pre-wrap leading-8">
            {entryQuery.data.body}
          </p>
          <PhotoGallery
            alt={entryQuery.data.title}
            entryId={entryQuery.data.id}
          />
          <p className="mt-10 text-sm text-muted">
            {t(`entry.sync.${entryQuery.data.syncStatus}`)}
          </p>
          {entryQuery.data.syncStatus === 'synced' ? null : (
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
