import { useQueryClient } from '@tanstack/react-query'
import { MapPin, MoreHorizontal } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { deleteEntry } from '@/entities/entry/api/entry-mutation.repository'
import { commitJourneyEntryTextUpdate } from '@/entities/journey/api/commit-journey-entry-text-update'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import { READER_STRIP_SIZES } from '@/entities/photo/lib/responsive-photo'
import { ResponsivePhotoImage } from '@/entities/photo/ui/ResponsivePhotoImage'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { excerptText } from '@/features/journeys/lib/excerpt-text'
import { formatMomentTimelineLabel } from '@/features/journeys/lib/format-moment-datetime'
import { InlineMomentEditor } from '@/features/journeys/ui/InlineMomentEditor'
import { momentShareFromPaths } from '@/features/sharing/hooks/use-journey-public-share'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import { ShareIconButton } from '@/features/sharing/ui/ShareIconButton'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { VideoPlayOverlay } from '@/features/photos/ui/VideoPlayOverlay'
import { MomentSyncIndicator } from '@/features/sync/ui/MomentSyncIndicator'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { useToast } from '@/shared/ui/use-toast'
import { cn } from '@/shared/lib/cn'

const CARD_PREVIEW_LIMIT = 3

interface MomentCardProps {
  canEdit: boolean
  creatorId: string
  highlighted?: boolean
  inDayGroup?: boolean
  journeyId: string
  moment: JourneyMoment
  onOpen?: (entryId: string) => void
  onUpdated?: () => void
  photoCount?: number
  photos: PhotoPreview[]
  publicPaths?: PublicJourneyPaths | null
}

export function MomentCard({
  canEdit,
  creatorId,
  highlighted = false,
  inDayGroup = false,
  journeyId,
  moment,
  onOpen,
  onUpdated,
  photoCount,
  photos,
  publicPaths,
}: MomentCardProps) {
  const { i18n, t } = useTranslation()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const titleId = useId()
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const title = moment.entry.title ?? t('dashboard.untitled')
  const initialTitle = moment.entry.title ?? ''
  const entrySlug = moment.entry.slug
  const syncStatus = moment.entry.syncStatus ?? 'synced'
  const isSynced = syncStatus === 'synced'
  const excerpt = excerptText(moment.entry.body)
  const previewPhotos = photos.slice(0, CARD_PREVIEW_LIMIT)
  const resolvedPhotos = usePhotoObjectUrls(previewPhotos)
  const totalPhotoCount = photoCount ?? photos.length
  const overflowCount = Math.max(0, totalPhotoCount - CARD_PREVIEW_LIMIT)
  const timeLabel = formatMomentTimelineLabel(
    moment.entry.eventAt,
    i18n.language,
    inDayGroup,
  )
  const stopTitle = moment.stop?.title.trim() ?? ''
  const locationLabel =
    stopTitle === '' || stopTitle === title.trim() ? null : stopTitle

  const momentShare =
    publicPaths !== null &&
    publicPaths !== undefined &&
    entrySlug !== null &&
    entrySlug !== ''
      ? momentShareFromPaths(publicPaths, entrySlug, title, (value) =>
          t('reader.shareMomentMessage', { title: value }),
        )
      : null

  function closeEditor() {
    setEditing(false)
  }

  function openEditor() {
    if (editing) {
      return
    }
    setEditing(true)
  }

  function openMoment() {
    if (editing) {
      return
    }
    onOpen?.(moment.entry.id)
  }

  async function handleRetrySync() {
    try {
      if (await canAutomaticallySync()) {
        await syncPendingOperations()
        onUpdated?.()
      }
    } catch {
      showToast({ message: t('moment.syncRetryFailed'), variant: 'error' })
    }
  }

  async function handleDelete() {
    setMenuOpen(false)
    if (!window.confirm(t('entry.deleteConfirm'))) {
      return
    }
    setDeleting(true)
    try {
      await deleteEntry(moment.entry.id, creatorId)
      onUpdated?.()
    } catch {
      showToast({ message: t('entry.error'), variant: 'error' })
      setDeleting(false)
    }
  }

  const previewBody = (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-semibold tracking-wide text-accent uppercase">
          {t(`entry.type.${moment.entry.type}`)}
        </span>
        {timeLabel === null ? null : (
          <>
            <span aria-hidden="true">·</span>
            <time
              {...(moment.entry.eventAt !== null
                ? { dateTime: moment.entry.eventAt }
                : {})}
            >
              {timeLabel}
            </time>
          </>
        )}
        {locationLabel === null ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden="true" size={12} />
              {locationLabel}
            </span>
          </>
        )}
        {moment.location === null ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden="true" size={12} />
              {t('journey.hasLocation')}
            </span>
          </>
        )}
      </div>

      <h4
        className="mt-1.5 text-lg leading-snug font-semibold tracking-[-0.01em]"
        id={titleId}
      >
        {title}
      </h4>

      {excerpt === '' ? null : (
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">
          {excerpt}
        </p>
      )}

      {resolvedPhotos.length > 0 ? (
        <ul aria-hidden="true" className="mt-3 flex gap-1.5 overflow-hidden">
          {resolvedPhotos.map((photo, index) => {
            const showOverflow =
              overflowCount > 0 && index === resolvedPhotos.length - 1
            return (
              <li
                className="relative size-14 shrink-0 overflow-hidden rounded-lg sm:size-16"
                key={photo.id}
              >
                <ResponsivePhotoImage
                  alt=""
                  className="size-full object-cover"
                  {...(typeof photo.height === 'number'
                    ? { height: photo.height }
                    : {})}
                  sizes={READER_STRIP_SIZES}
                  src={photo.url}
                  {...(typeof photo.width === 'number'
                    ? { width: photo.width }
                    : {})}
                />
                {photo.mediaType === 'video' ? <VideoPlayOverlay /> : null}
                {showOverflow ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white">
                    +{overflowCount}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </>
  )

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'author-moment-card overflow-hidden rounded-xl border border-border/70 bg-surface shadow-soft',
        highlighted &&
          'ring-2 ring-primary/40 motion-safe:animate-pulse motion-reduce:ring-primary/60',
        editing && 'ring-1 ring-primary/25',
      )}
      data-entry-id={moment.entry.id}
      data-sync-status={syncStatus}
      id={`moment-${moment.entry.id}`}
    >
      <div className="p-4">
        {editing ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent">
              {t(`entry.type.${moment.entry.type}`)}
            </p>
            <InlineMomentEditor
              creatorId={creatorId}
              entryId={moment.entry.id}
              initialBody={moment.entry.body}
              initialTitle={initialTitle}
              onCancel={closeEditor}
              onUpdated={async (updated) => {
                await commitJourneyEntryTextUpdate(queryClient, {
                  journeyId,
                  updated,
                })
                closeEditor()
                onUpdated?.()
              }}
            />
          </>
        ) : (
          <div className="flex items-start gap-3">
            {onOpen !== undefined ? (
              <button
                aria-labelledby={titleId}
                className="min-w-0 flex-1 rounded-lg text-left transition-colors hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                onClick={openMoment}
                type="button"
              >
                {previewBody}
              </button>
            ) : (
              <div className="min-w-0 flex-1">{previewBody}</div>
            )}

            <div
              className="flex shrink-0 items-start gap-0.5"
              data-moment-actions=""
            >
              <MomentSyncIndicator
                onRetry={() => {
                  void handleRetrySync()
                }}
                syncStatus={syncStatus}
              />
              {momentShare !== null ? (
                <ShareIconButton
                  disabled={!isSynced}
                  onDisabledClick={() => {
                    showToast({ message: t('moment.shareWaitForSync') })
                  }}
                  shareText={momentShare.shareText}
                  shareUrl={momentShare.shareUrl}
                  title={title}
                />
              ) : null}
              {canEdit ? (
                <button
                  className="inline-flex min-h-10 items-center rounded-lg px-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
                  onClick={openEditor}
                  type="button"
                >
                  {t('entry.editAction')}
                </button>
              ) : null}
              {canEdit ? (
                <div className="relative">
                  <button
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    aria-label={t('journey.more')}
                    className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-background"
                    onClick={() => {
                      setMenuOpen((open) => !open)
                    }}
                    type="button"
                  >
                    <MoreHorizontal aria-hidden="true" size={18} />
                  </button>
                  {menuOpen ? (
                    <>
                      <button
                        aria-label={t('journey.manageClose')}
                        className="fixed inset-0 z-10 cursor-default bg-transparent"
                        onClick={() => {
                          setMenuOpen(false)
                        }}
                        type="button"
                      />
                      <div
                        className="absolute right-0 top-[calc(100%+0.25rem)] z-20 min-w-[10rem] overflow-hidden rounded-xl border border-border/80 bg-surface shadow-soft"
                        role="menu"
                      >
                        <button
                          className="flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold text-destructive hover:bg-background disabled:opacity-50"
                          disabled={deleting}
                          onClick={() => {
                            void handleDelete()
                          }}
                          role="menuitem"
                          type="button"
                        >
                          {deleting
                            ? t('entry.deleting')
                            : t('entry.deleteAction')}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
