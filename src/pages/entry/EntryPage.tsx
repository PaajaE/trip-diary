import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteEntry } from '@/entities/entry/api/entry-mutation.repository'
import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { getPublicEntry } from '@/entities/entry/api/public-entry.repository'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import {
  invalidateAfterEntryDelete,
  invalidateAfterEntryUpdate,
} from '@/entities/entry/api/invalidate-after-entry-mutation'
import { getEntryPublicShare } from '@/entities/sharing/api/public-sharing.repository'
import { sharingQueryKeys } from '@/entities/sharing/api/sharing-query-keys'
import { useSession } from '@/features/auth/session'
import { EditEntryForm } from '@/features/entries/ui/EditEntryForm'
import { EntryTranslationPanel } from '@/features/entries/ui/EntryTranslationPanel'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { PhotoGallery } from '@/features/photos/ui/PhotoGallery'
import { buildEntryPublicShare } from '@/features/sharing/lib/build-share-messages'
import { ShareActions } from '@/features/sharing/ui/ShareActions'
import { CopyShareLink } from '@/features/sharing'
import { isRecordDeleted } from '@/shared/lib/local-deleted-records'
import { localDb } from '@/shared/lib/local-db'
import { shareUrl as sharePublicUrl } from '@/shared/lib/share'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { Button } from '@/shared/ui/Button'

interface EntryPageProps {
  entryId: string
  notice?: 'photos_failed'
  returnTo?: string
  shareUrl?: string
}

export function EntryPage({
  entryId,
  notice,
  returnTo,
  shareUrl,
}: EntryPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useSession()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const entryQuery = useQuery({
    queryKey: entryQueryKeys.detail(entryId),
    queryFn: async () => {
      if (await isRecordDeleted('entry', entryId)) {
        return null
      }
      return (await getLocalEntry(entryId)) ?? getPublicEntry(entryId)
    },
  })
  const publicShareQuery = useQuery({
    enabled: entryQuery.data !== undefined && entryQuery.data !== null,
    queryFn: () => getEntryPublicShare(entryId),
    queryKey: sharingQueryKeys.entryPublicShare(entryId),
  })
  const entry = entryQuery.data
  const publicShare =
    publicShareQuery.data === null || publicShareQuery.data === undefined
      ? null
      : buildEntryPublicShare(
          publicShareQuery.data,
          t('reader.shareMomentMessage', { title: entry?.title ?? '' }),
        )
  const canManage = user !== null && entry?.creatorId === user.id

  return (
    <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-8 sm:py-16">
      {returnTo !== undefined ? (
        <>
          <Link
            className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline"
            to={returnTo}
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {t('entry.back')}
          </Link>
          <p className="mt-3 text-sm text-muted">{t('entry.editOnTripHint')}</p>
        </>
      ) : null}
      {entry === undefined ? (
        <p className="mt-16 text-muted">{t('entry.loading')}</p>
      ) : entryQuery.isError ? (
        <p className="mt-16 text-destructive" role="alert">
          {t('entry.error')}
        </p>
      ) : entry === null ? (
        <p className="mt-16 text-muted">{t('entry.notFound')}</p>
      ) : editing && canManage ? (
        <article className="mt-16">
          <EditEntryForm
            creatorId={user.id}
            entry={entry}
            onCancel={() => {
              setEditing(false)
            }}
            onUpdated={(updated) => {
              setEditing(false)
              void entryQuery.refetch()
              void localDb.journeyLinks.get(updated.id).then((link) =>
                invalidateAfterEntryUpdate(queryClient, {
                  entryId: updated.id,
                  ...(link?.journeyId !== undefined
                    ? { journeyId: link.journeyId }
                    : {}),
                }),
              )
            }}
          />
        </article>
      ) : (
        <article className={returnTo === undefined ? 'mt-16' : 'mt-8'}>
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
          {publicShare !== null ? (
            <ShareActions
              className="mt-6"
              shareText={publicShare.shareText}
              shareUrl={publicShare.shareUrl}
              title={entry.title}
            />
          ) : shareUrl === undefined ? null : (
            <CopyShareLink
              className="mt-6"
              onCopy={() => sharePublicUrl(shareUrl, entry.title)}
            />
          )}
          <ContentEngagement
            className="mt-8 border-t border-border pt-8"
            target={{ id: entry.id, type: 'entry' }}
          />
          <PhotoGallery
            alt={entry.title}
            canDelete={canManage}
            {...(canManage ? { creatorId: user.id } : {})}
            entryId={entry.id}
            showPhotoEngagement={publicShare !== null}
          />
          <p className="mt-10 text-sm text-muted">
            {t(`entry.sync.${entry.syncStatus}`)}
          </p>
          {canManage ? (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={() => {
                  setEditing(true)
                }}
                variant="secondary"
              >
                {t('entry.editAction')}
              </Button>
              <Button
                disabled={deleting}
                onClick={() => {
                  if (!window.confirm(t('entry.deleteConfirm'))) {
                    return
                  }
                  setDeleting(true)
                  void deleteEntry(entry.id, user.id)
                    .then(async () => {
                      const link = await localDb.journeyLinks.get(entry.id)
                      await invalidateAfterEntryDelete(queryClient, {
                        entryId: entry.id,
                        userId: user.id,
                        ...(link?.journeyId !== undefined
                          ? { journeyId: link.journeyId }
                          : {}),
                      })
                      if (returnTo !== undefined) {
                        await navigate({ to: returnTo })
                        return
                      }
                      await navigate({ to: '/' })
                    })
                    .finally(() => {
                      setDeleting(false)
                    })
                }}
                variant="secondary"
              >
                {deleting ? t('entry.deleting') : t('entry.deleteAction')}
              </Button>
            </div>
          ) : null}
          {canManage && entry.language === 'cs' ? (
            <EntryTranslationPanel entry={entry} />
          ) : null}
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
