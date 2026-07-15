import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, Expand, Plus, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  listJourneyChecklistItems,
  setJourneyChecklistItemChecked,
} from '@/entities/checklist/api/checklist-mutation.repository'
import { checklistQueryKeys } from '@/entities/checklist/api/checklist-query-keys'
import { listJourneyObservations } from '@/entities/nature/api/observation.repository'
import { natureQueryKeys } from '@/entities/nature/api/nature-query-keys'
import { backfillEntryPhotoGps } from '@/entities/photo/api/backfill-photo-gps.repository'
import { listJourneyPhotoTagAssignments } from '@/entities/photo/api/photo-tag.repository'
import { getJourneyPhotoLocations } from '@/entities/photo/api/photo-location.repository'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
import {
  invalidateJourneyContentChange,
  invalidateJourneyNatureAggregates,
} from '@/entities/journey/api/invalidate-journey-queries'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import {
  useJourneyContributionQuery,
  useJourneyQuery,
} from '@/entities/journey/api/use-journey-query'
import {
  getMyJourneyRole,
  isJourneyOwner,
} from '@/entities/journey/api/journey-member.repository'
import { journeyMemberRoleLabels } from '@/entities/journey/model/journey-member'
import { useSession } from '@/features/auth/session'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'
import {
  loadJourneyGalleryPreviews,
  mergeJourneyGalleryPhotos,
} from '@/features/journeys/lib/journey-gallery'
import {
  scrollToJourneyAuthorSection,
  scrollToJourneyMoment,
  type JourneyAuthorSection,
} from '@/features/journeys/lib/journey-author-section'
import { useJourneyMapPhotoThumbs } from '@/features/journeys/lib/use-journey-map-photo-thumbs'
import { buildJourneyReturnPath } from '@/features/journeys/lib/journey-return-path'
import { groupTagsByPhotoId } from '@/features/journeys/lib/journey-tag-collections'
import { JourneyAddSheet } from '@/features/journeys/ui/JourneyAddSheet'
import { JourneyGallery } from '@/features/journeys/ui/JourneyGallery'
import { JourneyManageSheet } from '@/features/journeys/ui/JourneyManageSheet'
import { JourneyMap } from '@/features/journeys/ui/JourneyMap'
import { JourneyOverview } from '@/features/journeys/ui/JourneyOverview'
import { JourneyPlaceCaptureSheet } from '@/features/journeys/ui/JourneyPlaceCaptureSheet'
import { getJourneyMapPoints } from '@/features/journeys/ui/journey-map-points'
import { useJourneyPublicShare } from '@/features/sharing/hooks/use-journey-public-share'
import { ShareIconButton } from '@/features/sharing/ui/ShareIconButton'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { FullScreenSheet } from '@/shared/ui/FullScreenSheet'
import { RevalidatingIndicator } from '@/shared/ui/RevalidatingIndicator'
import { useToast } from '@/shared/ui/use-toast'

interface JourneyPageProps {
  highlight?: string
  journeyId: string
  natureGoalId?: string
  naturePrompt?: string
  notice?: 'photos_failed' | 'template_failed'
  section?: JourneyAuthorSection
  shareUrl?: string
}

export function JourneyPage({
  highlight,
  journeyId,
  natureGoalId,
  naturePrompt,
  notice,
  section,
}: JourneyPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { user } = useSession()
  const [manageOpen, setManageOpen] = useState(false)
  const [placeCaptureOpen, setPlaceCaptureOpen] = useState(false)
  const [addSheetOpen, setAddSheetOpen] = useState(false)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [focusedMapPointId, setFocusedMapPointId] = useState<string | null>(
    null,
  )
  const [pendingMapPhotoId, setPendingMapPhotoId] = useState<string | null>(
    null,
  )
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [highlightEntryId, setHighlightEntryId] = useState<string | null>(null)
  const [naturePromptEntryId, setNaturePromptEntryId] = useState<string | null>(
    null,
  )
  const [natureDetailOpen, setNatureDetailOpen] = useState(false)
  const [showNatureGoalsOnMap, setShowNatureGoalsOnMap] = useState(true)
  const [pendingHighlight, setPendingHighlight] = useState<string | null>(null)
  const savedToastShown = useRef(false)

  const query = useJourneyQuery(journeyId)
  const contributionQuery = useJourneyContributionQuery(journeyId)
  const ownerQuery = useQuery({
    queryFn: () => isJourneyOwner(journeyId),
    queryKey: journeyQueryKeys.owner(journeyId),
  })
  const myRoleQuery = useQuery({
    enabled: user !== null,
    queryFn: () => getMyJourneyRole(journeyId, user?.id ?? ''),
    queryKey: journeyQueryKeys.myRole(journeyId, user?.id),
  })
  const journey = query.data
  const content = journey === undefined ? null : composeJourneyContent(journey)
  const photoLocationsQuery = useQuery({
    enabled: content !== null && content.moments.length > 0,
    queryFn: () => getJourneyPhotoLocations(content?.moments ?? []),
    queryKey: photoQueryKeys.journeyPhotoLocations(
      journeyId,
      content?.moments.map((moment) => moment.entry.id) ?? [],
    ),
  })
  const tagAssignmentsQuery = useQuery({
    enabled: journey !== undefined,
    queryFn: () => listJourneyPhotoTagAssignments(journeyId),
    queryKey: photoQueryKeys.journeyTagAssignments(journeyId),
  })
  const checklistQuery = useQuery({
    enabled: journey !== undefined,
    queryFn: () => listJourneyChecklistItems(journeyId),
    queryKey: checklistQueryKeys.journey(journeyId),
  })
  const observationsQuery = useQuery({
    enabled: journey !== undefined,
    queryFn: () => listJourneyObservations(journeyId),
    queryKey: natureQueryKeys.journeyObservations(journeyId),
  })
  const galleryPreviewsQuery = useQuery({
    enabled: (content?.moments.length ?? 0) > 0,
    queryFn: () =>
      loadJourneyGalleryPreviews(content?.moments ?? [], async (entryId) => {
        const { getJourneyEntryPhotoPreviews } =
          await import('@/entities/photo/api/photo-gallery.repository')
        return getJourneyEntryPhotoPreviews(entryId)
      }),
    queryKey: photoQueryKeys.journeyGalleryByEntries(
      content?.moments.map((moment) => moment.entry.id) ?? [],
    ),
  })
  const tagAssignments = useMemo(
    () =>
      Array.isArray(tagAssignmentsQuery.data) ? tagAssignmentsQuery.data : [],
    [tagAssignmentsQuery.data],
  )
  const tagsByPhotoId = useMemo(
    () => groupTagsByPhotoId(tagAssignments),
    [tagAssignments],
  )
  const photoCount = useMemo(() => {
    if (content === null) {
      return 0
    }
    return mergeJourneyGalleryPhotos(
      content.moments,
      galleryPreviewsQuery.data?.previewsByMoment ?? [],
    ).length
  }, [content, galleryPreviewsQuery.data?.previewsByMoment])
  const { refetch: refetchPhotoLocations } = photoLocationsQuery
  const queryClient = useQueryClient()
  const photoThumbUrls = useJourneyMapPhotoThumbs(content?.moments ?? [])
  const mapPoints = useMemo(
    () =>
      content === null
        ? []
        : getJourneyMapPoints(
            content.moments,
            content.plannedStops,
            photoLocationsQuery.data ?? [],
            {
              checklistItems: checklistQuery.data ?? [],
              observations: observationsQuery.data ?? [],
            },
          ),
    [
      checklistQuery.data,
      content,
      observationsQuery.data,
      photoLocationsQuery.data,
    ],
  )
  const canEdit = contributionQuery.data === true
  const canManageMembers = ownerQuery.data === true
  const { paths: publicPaths, tripShare } = useJourneyPublicShare(
    journeyId,
    journey?.title ?? '',
  )
  const locatedPhotoIds = useMemo(
    () => new Set((photoLocationsQuery.data ?? []).map((photo) => photo.id)),
    [photoLocationsQuery.data],
  )
  const momentEntryIdsKey = useMemo(
    () => (content?.moments ?? []).map((moment) => moment.entry.id).join(','),
    [content?.moments],
  )
  const dateLabel = formatDateRange(
    journey?.startsAt ?? null,
    journey?.endsAt ?? null,
    t('journey.dateUnknown'),
  )

  useEffect(() => {
    if (section !== undefined) {
      scrollToJourneyAuthorSection(section)
    }
  }, [section])

  useEffect(() => {
    if (highlight === undefined) {
      return
    }

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setPendingHighlight(highlight)
      if (naturePrompt !== undefined) {
        setNaturePromptEntryId(naturePrompt)
      }

      if (!savedToastShown.current) {
        savedToastShown.current = true
        showToast({
          message:
            typeof navigator !== 'undefined' && navigator.onLine
              ? t('moment.saved')
              : t('moment.savedOffline'),
        })
      }

      void navigate({
        params: { journeyId },
        replace: true,
        search: (current) => preserveJourneySearch(current),
        to: '/j/$journeyId',
      })
    })

    return () => {
      cancelled = true
    }
  }, [highlight, journeyId, naturePrompt, navigate, showToast, t])

  useEffect(() => {
    if (pendingHighlight === null || content === null) {
      return
    }

    const momentExists = content.moments.some(
      (moment) => moment.entry.id === pendingHighlight,
    )
    if (!momentExists) {
      return
    }

    let cancelled = false
    const highlightId = pendingHighlight

    queueMicrotask(() => {
      if (cancelled) {
        return
      }

      setHighlightEntryId(highlightId)
      setExpandedEntryId(highlightId)
      scrollToJourneyMoment(highlightId)
    })

    const clearHighlight = window.setTimeout(() => {
      setHighlightEntryId(null)
      setPendingHighlight(null)
    }, 2500)

    return () => {
      cancelled = true
      window.clearTimeout(clearHighlight)
    }
  }, [content, pendingHighlight])

  function openMomentOnTimeline(entryId: string) {
    setExpandedEntryId(entryId)
    scrollToJourneyMoment(entryId)
  }

  function navigateToMemory() {
    void navigate({
      params: { journeyId },
      to: '/j/$journeyId/memory/new',
    })
  }

  function navigateToNote() {
    void navigate({
      params: { journeyId },
      search: { focus: 'note' },
      to: '/j/$journeyId/memory/new',
    })
  }

  function openFullPage(entryId: string) {
    void navigate({
      params: { entryId },
      search: {
        returnTo: buildJourneyReturnPath(journeyId, 'story'),
      },
      to: '/e/$entryId',
    })
  }

  function handleJourneyChanged() {
    void query.refetch()
    void invalidateJourneyContentChange(queryClient, journeyId)
  }

  useEffect(() => {
    if (momentEntryIdsKey === '') {
      return
    }

    void backfillEntryPhotoGps(momentEntryIdsKey.split(',')).then((result) => {
      if (result.filledPhotoIds.length === 0) {
        return
      }

      void refetchPhotoLocations()
      void canAutomaticallySync().then((canSync) => {
        if (!canSync) {
          return
        }
        void syncPendingOperations().catch(() => {
          // GPS backfill sync can retry later.
        })
      })
    })
  }, [momentEntryIdsKey, refetchPhotoLocations])

  function handleShowPhotoOnMap(photoId: string) {
    setPendingMapPhotoId(photoId)
    setFocusedMapPointId(`photo:${photoId}`)
    scrollToJourneyAuthorSection('map')
  }

  function handleShowNatureOnMap(checklistItemId: string) {
    setPendingMapPhotoId(null)
    setFocusedMapPointId(`nature-goal:${checklistItemId}`)
    scrollToJourneyAuthorSection('map')
  }

  async function handleMarkNatureGoalFromMap(
    item: Parameters<typeof setJourneyChecklistItemChecked>[0]['item'],
  ) {
    if (user?.id === undefined) {
      return
    }
    const nextChecked = item.checkedAt === null
    if (
      !nextChecked &&
      !window.confirm(t('nature.strip.markNotSpottedConfirm'))
    ) {
      return
    }
    await setJourneyChecklistItemChecked({
      checked: nextChecked,
      creatorId: user.id,
      item,
      journeyId,
    })
    await invalidateJourneyNatureAggregates(queryClient, journeyId)
  }

  const pendingMapPointId =
    pendingMapPhotoId !== null ? `photo:${pendingMapPhotoId}` : null
  const mapFocusPointId =
    pendingMapPointId !== null &&
    mapPoints.some((point) => point.id === pendingMapPointId)
      ? pendingMapPointId
      : focusedMapPointId

  return (
    <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-8 sm:py-16">
      {query.isError ? (
        <p className="mt-16 text-destructive">{t('journey.error')}</p>
      ) : query.isLoading ? (
        <p className="mt-16 text-muted">{t('journey.loading')}</p>
      ) : journey == null ? (
        <p className="mt-16 text-muted">{t('journey.notFound')}</p>
      ) : (
        <>
          {notice === 'photos_failed' ? (
            <p className="mt-10 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-900">
              {t('journey.photosFailedNotice')}
            </p>
          ) : null}
          {notice === 'template_failed' ? (
            <p className="mt-10 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-900">
              {t('journey.templateFailedNotice')}
            </p>
          ) : null}
          <header className="mt-8 border-b border-border/60 pb-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 px-0.5">
                <p className="text-sm text-muted">
                  {t(`journey.status.${journey.status}`)}
                  {myRoleQuery.data === null ||
                  myRoleQuery.data === undefined ? null : (
                    <>
                      {' · '}
                      {t('journey.yourRole', {
                        role: journeyMemberRoleLabels[myRoleQuery.data],
                      })}
                    </>
                  )}
                </p>
                <h1 className="mt-2 max-w-3xl text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
                  {journey.title}
                </h1>
                <RevalidatingIndicator
                  label={t('journey.revalidating')}
                  visible={query.isRevalidating}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays aria-hidden="true" size={15} />
                    {dateLabel}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {tripShare !== null ? (
                  <ShareIconButton
                    shareText={tripShare.shareText}
                    shareUrl={tripShare.shareUrl}
                    title={journey.title}
                  />
                ) : null}
                {canEdit ? (
                  <button
                    aria-label={t('journey.manageTrip')}
                    className="inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground"
                    onClick={() => {
                      setManageOpen(true)
                    }}
                    type="button"
                  >
                    <Settings2 aria-hidden="true" size={18} />
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          {content !== null ? (
            <>
              <JourneyOverview
                canEdit={canEdit}
                creatorId={user?.id ?? ''}
                expandedEntryId={expandedEntryId}
                highlightEntryId={highlightEntryId}
                journey={journey}
                journeyId={journeyId}
                mapPointCount={mapPoints.length}
                moments={content.moments}
                natureDetailOpen={natureDetailOpen}
                naturePromptEntryId={naturePromptEntryId}
                {...(natureGoalId !== undefined ? { natureGoalId } : {})}
                onAddNote={navigateToNote}
                onAddPhotos={navigateToMemory}
                onAddPlace={() => {
                  setPlaceCaptureOpen(true)
                }}
                onChanged={handleJourneyChanged}
                onExpandChange={setExpandedEntryId}
                onNatureDetailOpenChange={setNatureDetailOpen}
                onOpenFullPage={openFullPage}
                onShowNatureOnMap={handleShowNatureOnMap}
                photoCount={photoCount}
                publicPaths={publicPaths ?? null}
                stageContents={content.stageContents}
                tagsByPhotoId={tagsByPhotoId}
              />

              <section
                className="scroll-mt-24 border-t border-border/60 py-8 sm:scroll-mt-20 sm:py-10"
                id="map"
              >
                <div className="flex items-end justify-between gap-4">
                  <SectionHeading
                    eyebrow={t('journey.mapEyebrow')}
                    title={t('journey.map')}
                  />
                  {mapPoints.length > 0 ? (
                    <button
                      aria-label={t('journey.mapExpand')}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold shadow-soft transition hover:bg-background"
                      onClick={() => {
                        setMapExpanded(true)
                      }}
                      type="button"
                    >
                      <Expand aria-hidden="true" size={16} />
                      {t('journey.mapExpand')}
                    </button>
                  ) : null}
                </div>
                {mapPoints.some((point) => point.type === 'nature-goal') ? (
                  <label className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted">
                    <input
                      checked={showNatureGoalsOnMap}
                      className="size-4 rounded border-border text-primary"
                      onChange={(event) => {
                        setShowNatureGoalsOnMap(event.target.checked)
                      }}
                      type="checkbox"
                    />
                    {t('journey.mapShowNatureGoals')}
                  </label>
                ) : null}
                {photoLocationsQuery.isPending && content.moments.length > 0 ? (
                  <p className="mt-4 text-sm text-muted" role="status">
                    {t('journey.mapLoadingLocations')}
                  </p>
                ) : null}
                {mapPoints.length > 0 && !mapExpanded ? (
                  <div className="mt-4">
                    <JourneyMap
                      canEdit={canEdit}
                      checklistItems={checklistQuery.data ?? []}
                      focusPointId={mapFocusPointId}
                      moments={content.moments}
                      observations={observationsQuery.data ?? []}
                      onFocusPointChange={setFocusedMapPointId}
                      onMarkNatureGoalSpotted={(item) => {
                        void handleMarkNatureGoalFromMap(item)
                      }}
                      onOpenEntry={(entryId) => {
                        openMomentOnTimeline(entryId)
                      }}
                      photoLocations={photoLocationsQuery.data ?? []}
                      photoThumbUrls={photoThumbUrls}
                      plannedStops={content.plannedStops}
                      showNatureGoals={showNatureGoalsOnMap}
                    />
                  </div>
                ) : null}
                {mapPoints.length === 0 ? (
                  <p className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-6 text-muted">
                    {t('journey.mapEmpty')}
                  </p>
                ) : null}
              </section>

              <section
                className="scroll-mt-24 border-t border-border/60 py-8 sm:scroll-mt-20 sm:py-10"
                id="gallery"
              >
                <SectionHeading
                  eyebrow={t('journey.galleryEyebrow')}
                  title={t('journey.gallery')}
                />
                <JourneyGallery
                  canDelete={canEdit}
                  {...(user?.id !== undefined ? { creatorId: user.id } : {})}
                  journeyId={journeyId}
                  locatedPhotoIds={locatedPhotoIds}
                  moments={content.moments}
                  onOpenMoment={(entryId) => {
                    openMomentOnTimeline(entryId)
                  }}
                  onShowOnMap={handleShowPhotoOnMap}
                  showPhotoEngagement={
                    publicPaths !== null && publicPaths !== undefined
                  }
                  tagAssignments={tagAssignments}
                  tagsByPhotoId={tagsByPhotoId}
                />
              </section>
            </>
          ) : null}

          <FullScreenSheet
            closeLabel={t('journey.mapCollapse')}
            onClose={() => {
              setMapExpanded(false)
            }}
            open={mapExpanded}
            scrollable={false}
            title={t('journey.map')}
          >
            <JourneyMap
              canEdit={canEdit}
              checklistItems={checklistQuery.data ?? []}
              className="h-full min-h-0 w-full flex-1"
              focusPointId={mapFocusPointId}
              moments={content?.moments ?? []}
              observations={observationsQuery.data ?? []}
              onFocusPointChange={setFocusedMapPointId}
              onMarkNatureGoalSpotted={(item) => {
                void handleMarkNatureGoalFromMap(item)
              }}
              onOpenEntry={(entryId) => {
                setMapExpanded(false)
                openMomentOnTimeline(entryId)
              }}
              photoLocations={photoLocationsQuery.data ?? []}
              photoThumbUrls={photoThumbUrls}
              plannedStops={content?.plannedStops ?? []}
              showNatureGoals={showNatureGoalsOnMap}
            />
          </FullScreenSheet>

          {canEdit ? (
            <>
              <button
                aria-label={t('journey.addMoment')}
                className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-20 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:right-[max(1.25rem,calc((100vw-48rem)/2))]"
                onClick={() => {
                  setAddSheetOpen(true)
                }}
                type="button"
              >
                <Plus aria-hidden="true" size={24} />
              </button>
              <JourneyAddSheet
                journeyId={journeyId}
                onAddNote={navigateToNote}
                onAddPhotos={navigateToMemory}
                onAddPlace={() => {
                  setPlaceCaptureOpen(true)
                }}
                onClose={() => {
                  setAddSheetOpen(false)
                }}
                open={addSheetOpen}
              />
              <JourneyManageSheet
                canManageJourney={canManageMembers}
                canManageMembers={canManageMembers}
                creatorId={user?.id ?? ''}
                journey={journey}
                onChanged={handleJourneyChanged}
                onClose={() => {
                  setManageOpen(false)
                }}
                onDeleted={() => {
                  void navigate({ to: '/' })
                }}
                open={manageOpen}
                {...(publicPaths !== null && publicPaths !== undefined
                  ? { publicPaths }
                  : {})}
              />
              <JourneyPlaceCaptureSheet
                creatorId={user?.id ?? ''}
                journey={journey}
                onChanged={handleJourneyChanged}
                onClose={() => {
                  setPlaceCaptureOpen(false)
                }}
                open={placeCaptureOpen}
              />
            </>
          ) : null}
        </>
      )}
    </main>
  )
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string
  title: string
}) {
  return (
    <div>
      <p className="text-sm font-medium text-accent">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold">{title}</h2>
    </div>
  )
}

function preserveJourneySearch(current: {
  natureGoalId?: string | undefined
  notice?: 'photos_failed' | 'template_failed' | undefined
  section?: string | undefined
}) {
  const section = isJourneyAuthorSection(current.section)
    ? current.section
    : undefined

  return {
    ...(current.notice !== undefined ? { notice: current.notice } : {}),
    ...(current.natureGoalId !== undefined
      ? { natureGoalId: current.natureGoalId }
      : {}),
    ...(section !== undefined ? { section } : {}),
  }
}

function isJourneyAuthorSection(
  value: string | undefined,
): value is JourneyAuthorSection {
  return value === 'story' || value === 'map' || value === 'gallery'
}

function formatDateRange(
  startsAt: string | null,
  endsAt: string | null,
  fallback: string,
) {
  if (startsAt === null && endsAt === null) {
    return fallback
  }
  if (startsAt !== null && endsAt !== null) {
    return `${startsAt} - ${endsAt}`
  }
  return startsAt ?? endsAt ?? fallback
}
