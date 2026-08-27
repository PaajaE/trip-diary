import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteEntry } from '@/entities/entry/api/entry-mutation.repository'
import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { getPublicEntry } from '@/entities/entry/api/public-entry.repository'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import {
  getEntryPhotoEditPreviews,
  getEntryPhotoPreviews,
  getEntryPhotoViewPreviews,
} from '@/entities/photo/api/photo-gallery.repository'
import { invalidateAfterEntryDelete } from '@/entities/entry/api/invalidate-after-entry-mutation'
import { commitJourneyEntryTextUpdate } from '@/entities/journey/api/commit-journey-entry-text-update'
import { invalidateEntryTranslations } from '@/entities/translation/api/invalidate-entry-translations'
import { getEntryPublicShare } from '@/entities/sharing/api/public-sharing.repository'
import { sharingQueryKeys } from '@/entities/sharing/api/sharing-query-keys'
import { useSession } from '@/features/auth/session'
import { EntryTranslationPanel } from '@/features/entries/ui/EntryTranslationPanel'
import {
  MomentDetailActions,
  MomentDetailHeader,
} from '@/features/entries/ui/MomentDetailHeader'
import { MomentInlineTextFields } from '@/features/entries/ui/MomentInlineTextFields'
import { MomentMediaEditor } from '@/features/entries/ui/MomentMediaEditor'
import {
  MomentMediaCover,
  MomentMediaMosaic,
} from '@/features/entries/ui/MomentMediaView'
import { useMomentTextDraft } from '@/features/entries/lib/use-moment-text-draft'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { formatMomentDateLabel } from '@/features/journeys/lib/format-moment-datetime'
import { PhotoGallery } from '@/features/photos/ui/PhotoGallery'
import { buildEntryPublicShare } from '@/features/sharing/lib/build-share-messages'
import { ShareActions } from '@/features/sharing/ui/ShareActions'
import { CopyShareLink } from '@/features/sharing'
import type { Entry } from '@/entities/entry/model/entry'
import {
  momentMediaColumnClass,
  momentPageClass,
  momentTextColumnClass,
} from '@/features/journeys/ui/moment-editorial-layout'
import { isRecordDeleted } from '@/shared/lib/local-deleted-records'
import { localDb } from '@/shared/lib/local-db'
import { getSupabaseClient } from '@/shared/api/supabase'
import { shareUrl as sharePublicUrl } from '@/shared/lib/share'
import { Button } from '@/shared/ui/Button'
import { MetadataRow } from '@/shared/ui/MetadataRow'
import { StoryKicker } from '@/shared/ui/StoryKicker'
import { cn } from '@/shared/lib/cn'

interface EntryPageProps {
  entryId: string
  notice?: 'photos_failed'
  returnTo?: string
  shareUrl?: string
}

interface OwnerEntryDetailProps {
  entry: Entry
  journeyId?: string
  locationLabel?: string | null
  notice?: 'photos_failed'
  onEntryUpdated: (entry: Entry) => Promise<void>
  onSyncRetry: () => void
  publicShare: { shareText: string; shareUrl: string } | null
  returnTo?: string
  userId: string
}

function OwnerEntryDetail({
  entry,
  journeyId,
  locationLabel = null,
  notice,
  onEntryUpdated,
  onSyncRetry,
  publicShare,
  returnTo,
  userId,
}: OwnerEntryDetailProps) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const viewPhotosQuery = useQuery({
    queryFn: () => getEntryPhotoViewPreviews(entry.id),
    queryKey: entryQueryKeys.photoViewPreviews(entry.id),
  })

  const editPhotosQuery = useQuery({
    enabled: editing,
    queryFn: () => getEntryPhotoEditPreviews(entry.id),
    queryKey: entryQueryKeys.photoEditPreviews(entry.id),
  })

  const textDraft = useMomentTextDraft({
    creatorId: userId,
    enabled: editing,
    entry,
    onUpdated: (updated) => {
      void onEntryUpdated(updated)
    },
  })

  function invalidatePhotos() {
    void viewPhotosQuery.refetch()
    void editPhotosQuery.refetch()
  }

  async function handleDelete() {
    if (!window.confirm(t('entry.deleteConfirm'))) {
      return
    }
    setMenuOpen(false)
    setDeleting(true)
    try {
      const link = await localDb.journeyLinks.get(entry.id)
      await deleteEntry(entry.id, userId)
      await invalidateAfterEntryDelete(queryClient, {
        entryId: entry.id,
        userId,
        ...(link?.journeyId !== undefined ? { journeyId: link.journeyId } : {}),
      })
      if (returnTo !== undefined) {
        await navigate({ to: returnTo })
        return
      }
      await navigate({ to: '/' })
    } finally {
      setDeleting(false)
    }
  }

  async function toggleEditing() {
    if (editing) {
      await textDraft.flushSave()
      setEditing(false)
      return
    }
    setEditing(true)
  }

  const photosPending = viewPhotosQuery.isPending
  const photosError = viewPhotosQuery.isError
  const editPhotosPending = editing && editPhotosQuery.isPending
  const editPhotosError = editing && editPhotosQuery.isError

  const viewPhotoData = viewPhotosQuery.data
  const hasViewMedia =
    viewPhotoData !== undefined && viewPhotoData.totalCount > 0

  const backHref =
    returnTo ?? (journeyId !== undefined ? `/j/${journeyId}` : undefined)
  const dateLabel = formatMomentDateLabel(entry.eventAt, i18n.language)
  const resolvedLocation =
    locationLabel !== null &&
    locationLabel.trim() !== '' &&
    locationLabel.trim() !== entry.title.trim()
      ? locationLabel
      : null

  const ownerActions = (
    <MomentDetailActions
      deleting={deleting}
      editing={editing}
      entry={entry}
      menuOpen={menuOpen}
      onDelete={() => {
        void handleDelete()
      }}
      onEditToggle={() => {
        void toggleEditing()
      }}
      onMenuOpenChange={setMenuOpen}
      onSyncRetry={onSyncRetry}
      shareText={publicShare?.shareText ?? null}
      shareUrl={publicShare?.shareUrl ?? null}
    />
  )

  const header = (
    <MomentDetailHeader
      actionsSlot={ownerActions}
      editing={editing}
      entry={entry}
      onSyncRetry={onSyncRetry}
      saveState={textDraft.saveState}
      {...(backHref !== undefined ? { backHref } : {})}
    />
  )

  const noticeBanner =
    notice === 'photos_failed' ? (
      <p className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-900">
        {t('entry.photosFailedNotice')}
      </p>
    ) : null

  const metadataRow = (
    <MetadataRow
      className="mt-4"
      items={[
        { icon: CalendarDays, label: dateLabel ?? '' },
        { icon: MapPin, label: resolvedLocation ?? '' },
      ]}
    />
  )

  return (
    <>
      {noticeBanner}
      {header}

      {photosPending ? (
        <p
          className={cn(momentMediaColumnClass, 'mt-6 text-sm text-muted')}
          role="status"
        >
          {t('photos.loading')}
        </p>
      ) : photosError ? (
        <p
          className={cn(
            momentMediaColumnClass,
            'mt-6 text-sm text-destructive',
          )}
          role="alert"
        >
          {t('photos.error')}
        </p>
      ) : hasViewMedia ? (
        <MomentMediaCover
          alt={entry.title}
          entryId={entry.id}
          viewData={viewPhotoData}
        />
      ) : null}

      <div
        className={cn(
          momentTextColumnClass,
          hasViewMedia || photosPending || photosError ? 'mt-8' : 'pt-6',
        )}
      >
        <StoryKicker>{t(`entry.type.${entry.type}`)}</StoryKicker>
        <MomentInlineTextFields
          body={editing ? textDraft.body : entry.body}
          disabled={editing && textDraft.saveState === 'saving'}
          editing={editing}
          metaSlot={metadataRow}
          onBodyChange={editing ? textDraft.setBody : () => undefined}
          onTitleChange={editing ? textDraft.setTitle : () => undefined}
          title={editing ? textDraft.title : entry.title}
        />
      </div>

      {editing ? (
        editPhotosPending ? (
          <p
            className={cn(momentMediaColumnClass, 'mt-10 text-sm text-muted')}
            role="status"
          >
            {t('photos.loading')}
          </p>
        ) : editPhotosError ? (
          <p
            className={cn(
              momentMediaColumnClass,
              'mt-10 text-sm text-destructive',
            )}
            role="alert"
          >
            {t('photos.error')}
          </p>
        ) : (
          <div className={cn(momentMediaColumnClass, 'mt-10')}>
            <MomentMediaEditor
              alt={entry.title}
              creatorId={userId}
              entryId={entry.id}
              {...(journeyId !== undefined ? { journeyId } : {})}
              onPhotosChanged={invalidatePhotos}
              photos={editPhotosQuery.data ?? []}
            />
          </div>
        )
      ) : hasViewMedia ? (
        <MomentMediaMosaic
          alt={entry.title}
          className="mt-10"
          entryId={entry.id}
          showHeading
          viewData={viewPhotoData}
        />
      ) : null}

      <ContentEngagement
        className={cn(
          momentTextColumnClass,
          'mt-10 border-t border-border/30 pt-5',
        )}
        compact
        countsOnly
        target={{ id: entry.id, type: 'entry' }}
      />

      {entry.language === 'cs' ? (
        <section
          className={cn(
            momentTextColumnClass,
            'mt-8 border-t border-border/20 pt-5',
          )}
        >
          <EntryTranslationPanel entry={entry} variant="inline" />
        </section>
      ) : null}

      {!editing ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/40 bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:hidden">
          <Button
            className="min-h-11 w-full"
            onClick={() => {
              void toggleEditing()
            }}
            variant="secondary"
          >
            {t('entry.editAction')}
          </Button>
        </div>
      ) : null}
    </>
  )
}

export function EntryPage({
  entryId,
  notice,
  returnTo,
  shareUrl,
}: EntryPageProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useSession()

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
  const photosQuery = useQuery({
    enabled:
      entryQuery.data !== undefined &&
      entryQuery.data !== null &&
      entryQuery.data.creatorId !== user?.id,
    queryFn: () => getEntryPhotoPreviews(entryId),
    queryKey: entryQueryKeys.photoPreviews(entryId),
  })
  const journeyLinkQuery = useQuery({
    enabled:
      entryQuery.data !== undefined &&
      entryQuery.data !== null &&
      user !== null &&
      entryQuery.data.creatorId === user.id,
    queryFn: async () => {
      const local = (await localDb.journeyLinks.get(entryId)) ?? null
      if (local !== null) {
        return local
      }
      const { data, error } = await getSupabaseClient()
        .from('entry_journey_links')
        .select('journey_id')
        .eq('entry_id', entryId)
        .maybeSingle()
      if (error !== null || data === null) {
        return null
      }
      return {
        entryId,
        journeyId: data.journey_id,
        locationTitle: null,
      }
    },
    queryKey: ['entry-journey-link', entryId],
  })

  const entry = entryQuery.data
  const publicShare =
    publicShareQuery.data === null || publicShareQuery.data === undefined
      ? null
      : buildEntryPublicShare(
          publicShareQuery.data,
          t('reader.shareMomentMessage', { title: entry?.title ?? '' }),
        )

  async function handleEntryUpdated(updated: Entry) {
    void queryClient.setQueryData(entryQueryKeys.detail(updated.id), updated)
    const link = await localDb.journeyLinks.get(updated.id)
    if (link?.journeyId === undefined) {
      await invalidateEntryTranslations(queryClient, updated.id)
      return
    }
    await commitJourneyEntryTextUpdate(queryClient, {
      journeyId: link.journeyId,
      updated,
    })
  }

  const isOwner =
    entry !== undefined &&
    entry !== null &&
    user !== null &&
    entry.creatorId === user.id

  const mainClassName = isOwner
    ? 'reader-page min-h-svh pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] sm:pb-16'
    : cn(
        momentPageClass,
        'min-h-svh px-5 py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:py-16 sm:pb-16',
      )

  if (entry === undefined) {
    return (
      <main className={mainClassName}>
        <p className="mt-16 text-muted">{t('entry.loading')}</p>
      </main>
    )
  }

  if (entryQuery.isError) {
    return (
      <main className={mainClassName}>
        <p className="mt-16 text-destructive" role="alert">
          {t('entry.error')}
        </p>
      </main>
    )
  }

  if (entry === null) {
    return (
      <main className={mainClassName}>
        <p className="mt-16 text-muted">{t('entry.notFound')}</p>
      </main>
    )
  }

  return (
    <main className={mainClassName}>
      <article
        className={
          isOwner
            ? cn(momentPageClass, 'px-5 sm:px-8')
            : returnTo === undefined
              ? 'mt-4 sm:mt-10'
              : 'mt-2 sm:mt-6'
        }
        data-entry-id={entry.id}
        data-sync-status={entry.syncStatus}
      >
        {isOwner ? (
          <OwnerEntryDetail
            entry={entry}
            {...(journeyLinkQuery.data?.journeyId !== undefined
              ? { journeyId: journeyLinkQuery.data.journeyId }
              : {})}
            {...(typeof journeyLinkQuery.data?.locationTitle === 'string' &&
            journeyLinkQuery.data.locationTitle.trim() !== ''
              ? { locationLabel: journeyLinkQuery.data.locationTitle }
              : {})}
            {...(notice !== undefined ? { notice } : {})}
            onEntryUpdated={handleEntryUpdated}
            onSyncRetry={() => {
              void entryQuery.refetch()
            }}
            publicShare={publicShare}
            {...(returnTo !== undefined ? { returnTo } : {})}
            userId={user.id}
          />
        ) : (
          <>
            {notice === 'photos_failed' ? (
              <p className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-900">
                {t('entry.photosFailedNotice')}
              </p>
            ) : null}
            <div className={momentTextColumnClass}>
              <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-accent uppercase">
                {t(`entry.type.${entry.type}`)}
              </p>
              <MomentInlineTextFields
                body={entry.body}
                className="mt-3"
                editing={false}
                onBodyChange={() => undefined}
                onTitleChange={() => undefined}
                title={entry.title}
              />
            </div>
            {publicShare !== null ? (
              <ShareActions
                className={cn(momentTextColumnClass, 'mt-6')}
                shareText={publicShare.shareText}
                shareUrl={publicShare.shareUrl}
                title={entry.title}
              />
            ) : shareUrl !== undefined ? (
              <CopyShareLink
                className={cn(momentTextColumnClass, 'mt-6')}
                onCopy={() => {
                  void sharePublicUrl(shareUrl, entry.title)
                }}
              />
            ) : null}
            <ContentEngagement
              className={cn(
                momentTextColumnClass,
                'mt-8 border-t border-border/30 pt-5',
              )}
              collapsibleComposer
              compact
              target={{ id: entry.id, type: 'entry' }}
            />
            <div className={cn(momentMediaColumnClass, 'mt-10')}>
              {photosQuery.isPending ? (
                <p className="text-sm text-muted" role="status">
                  {t('photos.loading')}
                </p>
              ) : photosQuery.isError ? (
                <p className="text-sm text-destructive" role="alert">
                  {t('photos.error')}
                </p>
              ) : (
                <PhotoGallery
                  alt={entry.title}
                  entryId={entry.id}
                  showPhotoEngagement={publicShare !== null}
                />
              )}
            </div>
            <p
              className={cn(momentTextColumnClass, 'mt-10 text-sm text-muted')}
            >
              {t(`entry.sync.${entry.syncStatus}`)}
            </p>
          </>
        )}
      </article>
    </main>
  )
}
