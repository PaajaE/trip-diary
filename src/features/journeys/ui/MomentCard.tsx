import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ExternalLink, Leaf, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { PhotoPreview } from '@/entities/photo/api/photo-gallery.repository'
import type { PhotoTagAssignment } from '@/entities/photo/model/photo-tag'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import { InlineMomentEditor } from '@/features/journeys/ui/InlineMomentEditor'
import { NatureMatchBanner } from '@/features/nature/ui/NatureMatchBanner'
import { momentShareFromPaths } from '@/features/sharing/hooks/use-journey-public-share'
import type { PublicJourneyPaths } from '@/features/sharing/lib/public-paths'
import { ShareIconButton } from '@/features/sharing/ui/ShareIconButton'
import { EntryPhotoGrid } from '@/features/photos/ui/EntryPhotoGrid'
import { MomentSyncIndicator } from '@/features/sync/ui/MomentSyncIndicator'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { useToast } from '@/shared/ui/use-toast'
import { cn } from '@/shared/lib/cn'

interface MomentCardProps {
  canEdit: boolean
  creatorId: string
  expanded?: boolean
  highlighted?: boolean
  journey: JourneyDetail
  journeyId: string
  moment: JourneyMoment
  naturePrompt?: boolean
  natureGoalId?: string
  onExpandChange?: (entryId: string | null) => void
  onOpenFullPage?: (entryId: string) => void
  onUpdated?: () => void
  photos: PhotoPreview[]
  publicPaths?: PublicJourneyPaths | null
  tagsByPhotoId: Map<string, PhotoTagAssignment[]>
}

export function MomentCard({
  canEdit,
  creatorId,
  expanded = false,
  highlighted = false,
  journey,
  journeyId,
  moment,
  naturePrompt = false,
  natureGoalId,
  onExpandChange,
  onOpenFullPage,
  onUpdated,
  photos,
  publicPaths,
  tagsByPhotoId,
}: MomentCardProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [natureOpen, setNatureOpen] = useState(false)
  const [natureDismissed, setNatureDismissed] = useState(false)
  const title = moment.entry.title ?? t('dashboard.untitled')
  const entrySlug = moment.entry.slug
  const syncStatus = moment.entry.syncStatus ?? 'synced'
  const isSynced = syncStatus === 'synced'
  const momentShare =
    publicPaths !== null &&
    publicPaths !== undefined &&
    entrySlug !== null &&
    entrySlug !== ''
      ? momentShareFromPaths(publicPaths, entrySlug, title, (value) =>
          t('reader.shareMomentMessage', { title: value }),
        )
      : null

  function toggleExpanded() {
    if (expanded) {
      setEditing(false)
      onExpandChange?.(null)
      return
    }
    onExpandChange?.(moment.entry.id)
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

  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border border-border/80 bg-background/70 p-5 transition-shadow',
        highlighted &&
          'ring-2 ring-primary/40 motion-safe:animate-pulse motion-reduce:ring-primary/60',
      )}
      data-entry-id={moment.entry.id}
      id={`moment-${moment.entry.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={toggleExpanded}
          type="button"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            {t(`entry.type.${moment.entry.type}`)}
          </p>
          <h4 className="mt-2 text-lg font-semibold">{title}</h4>
        </button>
        <div className="flex shrink-0 items-center gap-1">
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
          {moment.location === null ? null : (
            <span
              aria-label={t('journey.hasLocation')}
              className="rounded-full bg-primary/10 p-2 text-primary"
            >
              <MapPin aria-hidden="true" size={16} />
            </span>
          )}
          <button
            aria-expanded={expanded}
            aria-label={expanded ? t('moment.collapse') : t('moment.expand')}
            className="rounded-full p-2 text-muted hover:bg-background"
            onClick={toggleExpanded}
            type="button"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn('transition-transform', expanded && 'rotate-180')}
              size={18}
            />
          </button>
        </div>
      </div>

      {moment.entry.body === '' ? null : (
        <p
          className={cn(
            'mt-3 leading-7 text-muted',
            !expanded && 'line-clamp-3',
          )}
        >
          {moment.entry.body}
        </p>
      )}

      {expanded ? (
        <>
          <EntryPhotoGrid
            alt={title}
            canDelete={canEdit}
            canEditTags={canEdit}
            creatorId={creatorId}
            entryId={moment.entry.id}
            journeyId={journey.id}
            photos={photos}
            showPhotoEngagement
            tagsByPhotoId={tagsByPhotoId}
          />
          {canEdit && !editing ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="text-sm font-semibold text-primary hover:underline"
                onClick={() => {
                  setEditing(true)
                }}
                type="button"
              >
                {t('entry.editAction')}
              </button>
              {onOpenFullPage !== undefined ? (
                <button
                  className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-foreground"
                  onClick={() => {
                    onOpenFullPage(moment.entry.id)
                  }}
                  type="button"
                >
                  <ExternalLink aria-hidden="true" size={14} />
                  {t('moment.openFullPage')}
                </button>
              ) : null}
            </div>
          ) : null}
          {canEdit && editing ? (
            <InlineMomentEditor
              creatorId={creatorId}
              entryId={moment.entry.id}
              onCancel={() => {
                setEditing(false)
              }}
              onUpdated={() => {
                setEditing(false)
                onUpdated?.()
                showToast({ message: t('moment.updated') })
                void queryClient.invalidateQueries({
                  queryKey: journeyQueryKeys.detail(journeyId),
                })
              }}
            />
          ) : null}
        </>
      ) : photos.length > 0 ? (
        <div className="mt-4">
          <EntryPhotoGrid
            alt={title}
            canDelete={false}
            canEditTags={false}
            creatorId={creatorId}
            entryId={moment.entry.id}
            journeyId={journey.id}
            photos={photos.slice(0, 3)}
            showPhotoEngagement={false}
            tagsByPhotoId={tagsByPhotoId}
          />
        </div>
      ) : null}

      {naturePrompt &&
      !natureDismissed &&
      photos.length > 0 &&
      canEdit &&
      !natureOpen ? (
        <button
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary"
          onClick={() => {
            setNatureOpen(true)
          }}
          type="button"
        >
          <Leaf aria-hidden="true" size={14} />
          {t('moment.spotWildlife')}
        </button>
      ) : null}

      {natureOpen ? (
        <NatureMatchBanner
          className="mt-4"
          creatorId={creatorId}
          entryId={moment.entry.id}
          entryTitle={title}
          journeyId={journeyId}
          {...(natureGoalId !== undefined ? { natureGoalId } : {})}
          {...(onUpdated !== undefined ? { onChanged: onUpdated } : {})}
          onDismiss={() => {
            setNatureOpen(false)
            setNatureDismissed(true)
          }}
          onSpotted={() => {
            setNatureOpen(false)
            setNatureDismissed(true)
            onUpdated?.()
          }}
          photoId={photos[0]?.id ?? null}
        />
      ) : null}
    </article>
  )
}
