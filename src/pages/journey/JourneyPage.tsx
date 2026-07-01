import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from '@tanstack/react-router'
import { CalendarDays, Expand, Plus, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  listJourneyChecklistItems,
  setJourneyChecklistItemChecked,
} from '@/entities/checklist/api/checklist-mutation.repository'
import { listJourneyObservations } from '@/entities/nature/api/observation.repository'
import { backfillEntryPhotoGps } from '@/entities/photo/api/backfill-photo-gps.repository'
import { listJourneyPhotoTagAssignments } from '@/entities/photo/api/photo-tag.repository'
import { getJourneyPhotoLocations } from '@/entities/photo/api/photo-location.repository'
import {
  useJourneyContributionQuery,
  useJourneyQuery,
} from '@/entities/journey/api/use-journey-query'
import {
  getMyJourneyRole,
  isJourneyOwner,
} from '@/entities/journey/api/journey-member.repository'
import { journeyMemberRoleLabels } from '@/entities/journey/model/journey-member'
import type { ContentTarget } from '@/entities/engagement/model/engagement'
import { useSession } from '@/features/auth/session'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'
import { useJourneyMapPhotoThumbs } from '@/features/journeys/lib/use-journey-map-photo-thumbs'
import { buildJourneyReturnPath } from '@/features/journeys/lib/journey-return-path'
import { scrollToJourneySectionNav } from '@/features/journeys/lib/scroll-to-journey-section-nav'
import { JourneyGallery } from '@/features/journeys/ui/JourneyGallery'
import { JourneyGuidesSection } from '@/features/journeys/ui/JourneyGuidesSection'
import { JourneyManageSheet } from '@/features/journeys/ui/JourneyManageSheet'
import { JourneyMoreSheet } from '@/features/journeys/ui/JourneyMoreSheet'
import { JourneyMap } from '@/features/journeys/ui/JourneyMap'
import { JourneyOverview } from '@/features/journeys/ui/JourneyOverview'
import { JourneyPlaceCaptureSheet } from '@/features/journeys/ui/JourneyPlaceCaptureSheet'
import {
  JourneySectionTabs,
  type JourneySection,
} from '@/features/journeys/ui/JourneySectionTabs'
import { getJourneyMapPoints } from '@/features/journeys/ui/journey-map-points'
import { groupTagsByPhotoId } from '@/features/journeys/lib/journey-tag-collections'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { useJourneyPublicShare } from '@/features/sharing/hooks/use-journey-public-share'
import { ShareActions } from '@/features/sharing/ui/ShareActions'
import { CopyShareLink } from '@/features/sharing'
import { shareUrl as sharePublicUrl } from '@/shared/lib/share'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'
import { RevalidatingIndicator } from '@/shared/ui/RevalidatingIndicator'
import { FullScreenSheet } from '@/shared/ui/FullScreenSheet'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'

type JourneyRouteSection = JourneySection | 'guides' | 'story'

interface JourneyPageProps {
  journeyId: string
  notice?: 'photos_failed'
  section?: JourneyRouteSection
  shareUrl?: string
}

function normalizeJourneySection(
  section?: JourneyRouteSection,
): JourneySection {
  if (
    section === undefined ||
    section === 'story' ||
    section === 'guides' ||
    section === 'more'
  ) {
    return 'overview'
  }
  return section
}

export function JourneyPage({
  journeyId,
  notice,
  section,
  shareUrl,
}: JourneyPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useSession()
  const [guideFormOpen, setGuideFormOpen] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [placeCaptureOpen, setPlaceCaptureOpen] = useState(false)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [focusedMapPointId, setFocusedMapPointId] = useState<string | null>(
    null,
  )
  const [pendingMapPhotoId, setPendingMapPhotoId] = useState<string | null>(
    null,
  )
  const query = useJourneyQuery(journeyId)
  const contributionQuery = useJourneyContributionQuery(journeyId)
  const ownerQuery = useQuery({
    queryFn: () => isJourneyOwner(journeyId),
    queryKey: ['journey-owner', journeyId],
  })
  const myRoleQuery = useQuery({
    enabled: user !== null,
    queryFn: () => getMyJourneyRole(journeyId, user?.id ?? ''),
    queryKey: ['journey-my-role', journeyId, user?.id],
  })
  const journey = query.data
  const content =
    journey === null || journey === undefined
      ? null
      : composeJourneyContent(journey)
  const photoLocationsQuery = useQuery({
    enabled: content !== null && content.moments.length > 0,
    queryFn: () => getJourneyPhotoLocations(content?.moments ?? []),
    queryKey: [
      'journey-photo-locations',
      journeyId,
      ...(content?.moments.map((moment) => moment.entry.id) ?? []),
    ],
  })
  const tagAssignmentsQuery = useQuery({
    enabled: journey !== null && journey !== undefined,
    queryFn: () => listJourneyPhotoTagAssignments(journeyId),
    queryKey: ['journey-photo-tags', journeyId, 'assignments'],
  })
  const checklistQuery = useQuery({
    enabled: journey !== null && journey !== undefined,
    queryFn: () => listJourneyChecklistItems(journeyId),
    queryKey: ['journey-checklist', journeyId],
  })
  const observationsQuery = useQuery({
    enabled: journey !== null && journey !== undefined,
    queryFn: () => listJourneyObservations(journeyId),
    queryKey: ['journey-observations', journeyId],
  })
  const tagAssignments = Array.isArray(tagAssignmentsQuery.data)
    ? tagAssignmentsQuery.data
    : []
  const tagsByPhotoId = useMemo(
    () => groupTagsByPhotoId(tagAssignments),
    [tagAssignments],
  )
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
  const [engagementOpen, setEngagementOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [guidesSheetOpen, setGuidesSheetOpen] = useState(false)
  const [natureDetailOpen, setNatureDetailOpen] = useState(false)
  const [showNatureGoalsOnMap, setShowNatureGoalsOnMap] = useState(true)
  const [activeSection, setActiveSection] = useState<JourneySection>(
    normalizeJourneySection(section),
  )
  const [syncedRoute, setSyncedRoute] = useState({ journeyId, section })
  const dateLabel = formatDateRange(
    journey?.startsAt ?? null,
    journey?.endsAt ?? null,
    t('journey.dateUnknown'),
  )

  function selectSection(next: JourneySection) {
    if (next === 'more') {
      setMoreOpen(true)
      return
    }
    setMoreOpen(false)
    setActiveSection(next)
    if (next !== 'map') {
      setMapExpanded(false)
    }
  }

  if (syncedRoute.journeyId !== journeyId || syncedRoute.section !== section) {
    setSyncedRoute({ journeyId, section })
    setActiveSection(normalizeJourneySection(section))
    setManageOpen(false)
    setPlaceCaptureOpen(false)
    setMapExpanded(false)
    setGuideFormOpen(false)
    setMoreOpen(section === 'more')
    setGuidesSheetOpen(section === 'guides')
  }

  const pendingMapPointId =
    pendingMapPhotoId !== null ? `photo:${pendingMapPhotoId}` : null
  const mapFocusPointId =
    pendingMapPointId !== null &&
    mapPoints.some((point) => point.id === pendingMapPointId)
      ? pendingMapPointId
      : focusedMapPointId

  useEffect(() => {
    scrollToJourneySectionNav()
  }, [activeSection])

  function openEntryFromJourney(
    entryId: string,
    fromSection: JourneySection = activeSection,
  ) {
    void navigate({
      params: { entryId },
      search: {
        returnTo: buildJourneyReturnPath(journeyId, fromSection),
      },
      to: '/e/$entryId',
    })
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
    selectSection('map')
  }

  function handleShowNatureOnMap(checklistItemId: string) {
    setPendingMapPhotoId(null)
    setFocusedMapPointId(`nature-goal:${checklistItemId}`)
    selectSection('map')
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
    await queryClient.invalidateQueries({
      queryKey: ['journey-checklist', journeyId],
    })
    await queryClient.invalidateQueries({
      queryKey: ['journey-observations', journeyId],
    })
  }

  function handleAddAdvice() {
    setGuideFormOpen(true)
    setGuidesSheetOpen(true)
  }

  const publicShareUrl = tripShare?.shareUrl ?? shareUrl

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
          <header className="mt-8 border-b border-border/60 pb-6">
            <div className="px-0.5">
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
              {canEdit || shareUrl !== undefined || tripShare !== null ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {canEdit ? (
                    <button
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-border/80 px-4 text-sm font-medium text-muted transition-colors hover:bg-background sm:w-auto"
                      onClick={() => {
                        setManageOpen(true)
                      }}
                      type="button"
                    >
                      <Settings2 aria-hidden="true" size={17} />
                      {t('journey.manageTrip')}
                    </button>
                  ) : null}
                  {tripShare !== null ? (
                    <ShareActions
                      shareText={tripShare.shareText}
                      shareUrl={tripShare.shareUrl}
                      title={journey.title}
                    />
                  ) : shareUrl === undefined ? null : (
                    <CopyShareLink
                      className="bg-white/80 sm:min-h-11"
                      onCopy={() => sharePublicUrl(shareUrl, journey.title)}
                    />
                  )}
                </div>
              ) : null}
            </div>
          </header>

          <JourneySectionTabs
            activeSection={activeSection}
            moreOpen={moreOpen}
            onSelect={selectSection}
          />

          <CollapsibleEngagement
            onToggle={() => {
              setEngagementOpen((open) => !open)
            }}
            open={engagementOpen}
            target={{ id: journeyId, type: 'journey' }}
          />

          {activeSection === 'overview' && content !== null ? (
            <JourneyOverview
              canEdit={canEdit}
              creatorId={user?.id ?? ''}
              journey={journey}
              journeyId={journeyId}
              mapPointCount={mapPoints.length}
              moments={content.moments}
              onAddPlace={() => {
                setPlaceCaptureOpen(true)
              }}
              onChanged={() => {
                void query.refetch()
              }}
              natureDetailOpen={natureDetailOpen}
              onNatureDetailOpenChange={setNatureDetailOpen}
              onNavigateSection={selectSection}
              onOpenEntry={(entryId) => {
                openEntryFromJourney(entryId, 'overview')
              }}
              onShowNatureOnMap={handleShowNatureOnMap}
              stageContents={content.stageContents}
              tagsByPhotoId={tagsByPhotoId}
            />
          ) : null}

          {activeSection === 'map' ? (
            <section
              className="scroll-mt-24 py-8 sm:scroll-mt-20 sm:py-10"
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
              {photoLocationsQuery.isPending &&
              (content?.moments.length ?? 0) > 0 ? (
                <p className="mt-4 text-sm text-muted" role="status">
                  {t('journey.mapLoadingLocations')}
                </p>
              ) : null}
              {pendingMapPhotoId !== null &&
              !(
                pendingMapPointId !== null &&
                mapPoints.some((point) => point.id === pendingMapPointId)
              ) ? (
                <p className="mt-4 text-sm text-muted" role="status">
                  {t('journey.mapLocatingPhoto')}
                </p>
              ) : null}
              {mapPoints.length > 0 && !mapExpanded ? (
                <JourneyMap
                  canEdit={canEdit}
                  checklistItems={checklistQuery.data ?? []}
                  focusPointId={mapFocusPointId}
                  moments={content?.moments ?? []}
                  observations={observationsQuery.data ?? []}
                  onFocusPointChange={setFocusedMapPointId}
                  onMarkNatureGoalSpotted={(item) => {
                    void handleMarkNatureGoalFromMap(item)
                  }}
                  onOpenEntry={(entryId) => {
                    openEntryFromJourney(entryId, 'map')
                  }}
                  photoLocations={photoLocationsQuery.data ?? []}
                  photoThumbUrls={photoThumbUrls}
                  plannedStops={content?.plannedStops ?? []}
                  showNatureGoals={showNatureGoalsOnMap}
                />
              ) : null}
              {mapPoints.length === 0 ? (
                <p className="mt-6 rounded-2xl border border-dashed border-border bg-surface p-6 text-muted">
                  {t('journey.mapEmpty')}
                </p>
              ) : null}
            </section>
          ) : null}

          {activeSection === 'gallery' ? (
            <section
              className="scroll-mt-24 py-8 sm:scroll-mt-20 sm:py-10"
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
                moments={content?.moments ?? []}
                onOpenMoment={(entryId) => {
                  openEntryFromJourney(entryId, 'gallery')
                }}
                onShowOnMap={handleShowPhotoOnMap}
                showPhotoEngagement={
                  publicPaths !== null && publicPaths !== undefined
                }
                tagAssignments={tagAssignments}
                tagsByPhotoId={tagsByPhotoId}
              />
            </section>
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
              className="min-h-0 flex-1"
              focusPointId={mapFocusPointId}
              moments={content?.moments ?? []}
              observations={observationsQuery.data ?? []}
              onFocusPointChange={setFocusedMapPointId}
              onMarkNatureGoalSpotted={(item) => {
                void handleMarkNatureGoalFromMap(item)
              }}
              onOpenEntry={(entryId) => {
                setMapExpanded(false)
                openEntryFromJourney(entryId, 'map')
              }}
              photoLocations={photoLocationsQuery.data ?? []}
              photoThumbUrls={photoThumbUrls}
              plannedStops={content?.plannedStops ?? []}
              showNatureGoals={showNatureGoalsOnMap}
            />
          </FullScreenSheet>

          <JourneyMoreSheet
            canEdit={canEdit}
            onClose={() => {
              setMoreOpen(false)
            }}
            onOpenGuides={handleAddAdvice}
            onOpenNature={() => {
              setNatureDetailOpen(true)
            }}
            open={moreOpen}
            {...(publicShareUrl !== undefined
              ? {
                  onCopyShareLink: () => {
                    void sharePublicUrl(publicShareUrl, journey.title)
                  },
                  shareUrl: publicShareUrl,
                }
              : {})}
            {...(canEdit
              ? {
                  onManageTrip: () => {
                    setManageOpen(true)
                  },
                }
              : {})}
          />

          <SoftBottomSheet
            closeLabel={t('nature.strip.close')}
            onClose={() => {
              setGuidesSheetOpen(false)
              setGuideFormOpen(false)
            }}
            open={guidesSheetOpen}
            title={t('journey.guides')}
          >
            <JourneyGuidesSection
              canEdit={canEdit}
              creatorId={user?.id ?? ''}
              journey={journey}
              onChanged={() => {
                setGuideFormOpen(false)
                void query.refetch()
              }}
              showAddForm={guideFormOpen}
            />
          </SoftBottomSheet>

          {canEdit ? (
            <Link
              aria-label={t('journey.addMoment')}
              className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-5 z-20 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:right-[max(1.25rem,calc((100vw-48rem)/2))]"
              params={{ journeyId }}
              to="/j/$journeyId/memory/new"
            >
              <Plus aria-hidden="true" size={24} />
            </Link>
          ) : null}

          {canEdit ? (
            <>
              <JourneyManageSheet
                canManageJourney={canManageMembers}
                canManageMembers={canManageMembers}
                creatorId={user?.id ?? ''}
                journey={journey}
                onChanged={() => {
                  void query.refetch()
                }}
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
                onChanged={() => {
                  void query.refetch()
                }}
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

function CollapsibleEngagement({
  onToggle,
  open,
  target,
}: {
  onToggle: () => void
  open: boolean
  target: ContentTarget
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-5">
      <button
        className="text-sm text-muted hover:text-foreground"
        onClick={onToggle}
        type="button"
      >
        {open ? t('journey.engagementHide') : t('journey.engagementShow')}
      </button>
      {open ? (
        <ContentEngagement
          className="mt-3 rounded-xl bg-background/60 p-4 sm:p-5"
          target={target}
        />
      ) : null}
    </div>
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
