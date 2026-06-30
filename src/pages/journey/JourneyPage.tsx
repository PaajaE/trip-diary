import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CalendarDays, Expand, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { useSession } from '@/features/auth/session'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'
import { buildJourneyReturnPath } from '@/features/journeys/lib/journey-return-path'
import { scrollToJourneySectionNav } from '@/features/journeys/lib/scroll-to-journey-section-nav'
import { JourneyGallery } from '@/features/journeys/ui/JourneyGallery'
import { JourneyGuidesSection } from '@/features/journeys/ui/JourneyGuidesSection'
import { JourneyManageSheet } from '@/features/journeys/ui/JourneyManageSheet'
import { JourneyMap } from '@/features/journeys/ui/JourneyMap'
import { JourneyOverview } from '@/features/journeys/ui/JourneyOverview'
import { JourneyPlaceCaptureSheet } from '@/features/journeys/ui/JourneyPlaceCaptureSheet'
import {
  JourneySectionTabs,
  type JourneySection,
} from '@/features/journeys/ui/JourneySectionTabs'
import { JourneyStorySection } from '@/features/journeys/ui/JourneyStorySection'
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

interface JourneyPageProps {
  journeyId: string
  notice?: 'photos_failed'
  section?: JourneySection
  shareUrl?: string
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
  const openGuideOnGuidesRef = useRef(false)
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
  const tagAssignments = Array.isArray(tagAssignmentsQuery.data)
    ? tagAssignmentsQuery.data
    : []
  const tagsByPhotoId = useMemo(
    () => groupTagsByPhotoId(tagAssignments),
    [tagAssignments],
  )
  const { refetch: refetchPhotoLocations } = photoLocationsQuery
  const mapPoints = useMemo(
    () =>
      content === null
        ? []
        : getJourneyMapPoints(
            content.moments,
            content.plannedStops,
            photoLocationsQuery.data ?? [],
          ),
    [content, photoLocationsQuery.data],
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
  const [activeSection, setActiveSection] = useState<JourneySection>(
    section ?? 'overview',
  )
  const dateLabel = formatDateRange(
    journey?.startsAt ?? null,
    journey?.endsAt ?? null,
    t('journey.dateUnknown'),
  )

  function selectSection(next: JourneySection) {
    setActiveSection(next)
  }

  useEffect(() => {
    setActiveSection(section ?? 'overview')
  }, [journeyId, section])

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
    setManageOpen(false)
    setPlaceCaptureOpen(false)
    setMapExpanded(false)
    setGuideFormOpen(false)
  }, [journeyId])

  useEffect(() => {
    if (activeSection === 'guides') {
      if (openGuideOnGuidesRef.current) {
        setGuideFormOpen(true)
        openGuideOnGuidesRef.current = false
      }
      return
    }
    setGuideFormOpen(false)
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'map') {
      setMapExpanded(false)
    }
  }, [activeSection])

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

  useEffect(() => {
    if (pendingMapPhotoId === null) {
      return
    }

    const pointId = `photo:${pendingMapPhotoId}`
    if (mapPoints.some((point) => point.id === pointId)) {
      setFocusedMapPointId(pointId)
      setPendingMapPhotoId(null)
    }
  }, [mapPoints, pendingMapPhotoId])

  function handleShowPhotoOnMap(photoId: string) {
    setPendingMapPhotoId(photoId)
    setFocusedMapPointId(`photo:${photoId}`)
    selectSection('map')
  }

  function handleAddAdvice() {
    openGuideOnGuidesRef.current = true
    selectSection('guides')
  }

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
          <header className="mt-10 overflow-hidden rounded-[2rem] border border-border bg-surface shadow-soft">
            <div className="bg-[radial-gradient(circle_at_top_left,_rgba(184,95,66,0.18),_transparent_36%),linear-gradient(135deg,_rgba(40,88,69,0.12),_rgba(255,253,248,0.8))] px-5 py-6 sm:px-8 sm:py-8">
              <p className="text-sm font-medium text-accent">
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
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
                {journey.title}
              </h1>
              <RevalidatingIndicator
                label={t('journey.revalidating')}
                visible={query.isRevalidating}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-2">
                  <CalendarDays aria-hidden="true" size={16} />
                  {dateLabel}
                </span>
              </div>
              {canEdit || shareUrl !== undefined || tripShare !== null ? (
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {canEdit ? (
                    <button
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-white/80 px-5 text-sm font-semibold transition-colors hover:bg-white sm:w-auto"
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
            onSelect={selectSection}
          />

          <ContentEngagement
            className="mt-6 rounded-[1.5rem] border border-border bg-surface p-5 shadow-soft sm:p-6"
            target={{ id: journeyId, type: 'journey' }}
          />

          {activeSection === 'overview' && content !== null ? (
            <JourneyOverview
              canEdit={canEdit}
              journey={journey}
              journeyId={journeyId}
              mapPointCount={mapPoints.length}
              moments={content.moments}
              onAddAdvice={handleAddAdvice}
              onAddPlace={() => {
                setPlaceCaptureOpen(true)
              }}
              onNavigateSection={selectSection}
              onOpenEntry={(entryId) => {
                openEntryFromJourney(entryId, 'overview')
              }}
            />
          ) : null}

          {activeSection === 'story' && content !== null ? (
            <section
              className="scroll-mt-24 py-8 sm:scroll-mt-20 sm:py-10"
              id="story"
            >
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-accent">
                    {t('journey.storyEyebrow')}
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold">
                    {t('journey.story')}
                  </h2>
                </div>
              </div>
              <JourneyStorySection
                canEdit={canEdit}
                creatorId={user?.id ?? ''}
                journey={journey}
                journeyId={journeyId}
                moments={content.moments}
                onChanged={() => void query.refetch()}
                onOpenEntry={(entryId) => {
                  openEntryFromJourney(entryId, 'story')
                }}
                stageContents={content.stageContents}
                tagsByPhotoId={tagsByPhotoId}
              />
            </section>
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
              {photoLocationsQuery.isPending &&
              (content?.moments.length ?? 0) > 0 ? (
                <p className="mt-4 text-sm text-muted" role="status">
                  {t('journey.mapLoadingLocations')}
                </p>
              ) : null}
              {pendingMapPhotoId !== null ? (
                <p className="mt-4 text-sm text-muted" role="status">
                  {t('journey.mapLocatingPhoto')}
                </p>
              ) : null}
              {mapPoints.length > 0 && !mapExpanded ? (
                <JourneyMap
                  focusPointId={focusedMapPointId}
                  moments={content?.moments ?? []}
                  onFocusPointChange={setFocusedMapPointId}
                  onOpenEntry={(entryId) => {
                    openEntryFromJourney(entryId, 'map')
                  }}
                  photoLocations={photoLocationsQuery.data ?? []}
                  plannedStops={content?.plannedStops ?? []}
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
              className="min-h-0 flex-1"
              focusPointId={focusedMapPointId}
              moments={content?.moments ?? []}
              onFocusPointChange={setFocusedMapPointId}
              onOpenEntry={(entryId) => {
                setMapExpanded(false)
                openEntryFromJourney(entryId, 'map')
              }}
              photoLocations={photoLocationsQuery.data ?? []}
              plannedStops={content?.plannedStops ?? []}
            />
          </FullScreenSheet>

          {activeSection === 'guides' ? (
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
