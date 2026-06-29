import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  CalendarDays,
  Circle,
  Expand,
  MapPin,
  Plus,
  Settings2,
  Signpost,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import {
  deleteJourneyStage,
  deleteJourneyStop,
  moveJourneyMomentToStage,
} from '@/entities/journey/api/journey.repository'
import { backfillEntryPhotoGps } from '@/entities/photo/api/backfill-photo-gps.repository'
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
import {
  composeJourneyContent,
  type JourneyMoment,
  type JourneyStageContent,
} from '@/features/journeys/lib/journey-content'
import { buildJourneyReturnPath } from '@/features/journeys/lib/journey-return-path'
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
import { getJourneyMapPoints } from '@/features/journeys/ui/journey-map-points'
import { PhotoGallery } from '@/features/photos/ui/PhotoGallery'
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
    window.scrollTo({ behavior: 'instant', top: 0 })
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
              {canEdit || shareUrl !== undefined ? (
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  {canEdit ? (
                    <>
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
                      {canManageMembers ? (
                        <Link
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-white/80 px-5 text-sm font-semibold transition-colors hover:bg-white sm:w-auto"
                          params={{ journeyId: journey.id }}
                          to="/j/$journeyId/members"
                        >
                          <UsersRound aria-hidden="true" size={17} />
                          {t('journey.manageMembers')}
                        </Link>
                      ) : null}
                    </>
                  ) : null}
                  {shareUrl === undefined ? null : (
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

          {activeSection === 'story' ? (
          <section className="py-8 sm:py-10" id="story">
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
            {content !== null && content.moments.length === 0 ? (
              <EmptyJourneyState journeyId={journey.id} />
            ) : (
              <div className="mt-8 space-y-8">
                {content?.stageContents.map((stageContent) => (
                  <StageContent
                    canEdit={canEdit}
                    content={stageContent}
                    creatorId={user?.id ?? ''}
                    journey={journey}
                    key={stageContent.stage?.id ?? 'unassigned'}
                    onChanged={() => void query.refetch()}
                    onOpenEntry={(entryId) => {
                      openEntryFromJourney(entryId, 'story')
                    }}
                  />
                ))}
              </div>
            )}

          </section>
          ) : null}

          {activeSection === 'map' ? (
          <section className="py-8 sm:py-10" id="map">
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
          <section className="py-8 sm:py-10" id="gallery">
            <SectionHeading
              eyebrow={t('journey.galleryEyebrow')}
              title={t('journey.gallery')}
            />
            <JourneyGallery
              canDelete={canEdit}
              {...(user?.id !== undefined ? { creatorId: user.id } : {})}
              locatedPhotoIds={locatedPhotoIds}
              moments={content?.moments ?? []}
              onOpenMoment={(entryId) => {
                openEntryFromJourney(entryId, 'gallery')
              }}
              onShowOnMap={handleShowPhotoOnMap}
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

function StageContent({
  canEdit,
  content,
  creatorId,
  journey,
  onChanged,
  onOpenEntry,
}: {
  canEdit: boolean
  content: JourneyStageContent
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
  onOpenEntry: (entryId: string) => void
}) {
  const { t } = useTranslation()

  return (
    <section className="rounded-[1.5rem] border border-border bg-surface p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="flex items-center gap-3 text-xl font-semibold">
          <Signpost aria-hidden="true" size={18} />
          {content.stage?.title ?? t('journey.freeMoments')}
        </h3>
        {canEdit && content.stage !== null ? (
          <button
            className="text-sm font-semibold text-destructive"
            onClick={() => {
              const stageId = content.stage?.id
              if (stageId === undefined) {
                return
              }
              if (!window.confirm(t('journey.deleteStageConfirm'))) {
                return
              }
              void deleteJourneyStage(creatorId, journey.id, stageId).then(
                onChanged,
              )
            }}
            type="button"
          >
            {t('journey.deleteStageAction')}
          </button>
        ) : null}
      </div>
      <div className="mt-6 space-y-4">
        {content.moments.map((moment) => (
          <MomentCard
            canEdit={canEdit}
            creatorId={creatorId}
            journey={journey}
            key={moment.entry.id}
            moment={moment}
            onChanged={onChanged}
            onOpenEntry={onOpenEntry}
          />
        ))}
        {content.plannedStops.length === 0 ? null : (
          <div className="pt-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {t('journey.plannedPlaces')}
            </p>
            <div className="space-y-3">
              {content.plannedStops.map((stop) => (
                <article
                  className="rounded-xl border border-dashed border-border bg-background/60 p-4"
                  key={stop.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-3 font-semibold">
                      <Circle aria-hidden="true" size={14} />
                      {stop.title}
                    </p>
                    {canEdit ? (
                      <button
                        className="text-xs font-semibold text-destructive"
                        onClick={() => {
                          if (!window.confirm(t('journey.deleteStopConfirm'))) {
                            return
                          }
                          void deleteJourneyStop(
                            creatorId,
                            journey.id,
                            stop.id,
                          ).then(onChanged)
                        }}
                        type="button"
                      >
                        {t('journey.deleteStopAction')}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
        {content.moments.length === 0 && content.plannedStops.length === 0 ? (
          <p className="text-sm text-muted">{t('journey.emptyStage')}</p>
        ) : null}
      </div>
    </section>
  )
}

function MomentCard({
  canEdit,
  creatorId,
  journey,
  moment,
  onChanged,
  onOpenEntry,
}: {
  canEdit: boolean
  creatorId: string
  journey: JourneyDetail
  moment: JourneyMoment
  onChanged: () => void
  onOpenEntry: (entryId: string) => void
}) {
  const { t } = useTranslation()
  const title = moment.entry.title ?? t('dashboard.untitled')
  const [moving, setMoving] = useState(false)
  const [moveFailed, setMoveFailed] = useState(false)

  return (
    <article className="overflow-hidden rounded-2xl border border-border/80 bg-background/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">
            {t(`entry.type.${moment.entry.type}`)}
          </p>
          <h4 className="mt-2 text-lg font-semibold">{title}</h4>
        </div>
        {moment.location === null ? null : (
          <span
            aria-label={t('journey.hasLocation')}
            className="rounded-full bg-primary/10 p-2 text-primary"
          >
            <MapPin aria-hidden="true" size={16} />
          </span>
        )}
      </div>
      {moment.entry.body === '' ? null : (
        <p className="mt-3 line-clamp-3 leading-7 text-muted">
          {moment.entry.body}
        </p>
      )}
      <PhotoGallery
        alt={title}
        canDelete={canEdit}
        {...(canEdit ? { creatorId } : {})}
        entryId={moment.entry.id}
        onOpenMoment={onOpenEntry}
        showEmpty={false}
      />
      {!canEdit || journey.stages.length === 0 ? null : (
        <label className="mt-5 block text-sm font-medium text-muted">
          {t('journey.organizeMoment')}
          <select
            className="mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-foreground"
            disabled={moving}
            onChange={(event) => {
              setMoveFailed(false)
              setMoving(true)
              void moveJourneyMomentToStage({
                creatorId,
                entryId: moment.entry.id,
                journeyId: journey.id,
                stageId: event.currentTarget.value || null,
                stopId: moment.entry.stopId,
              })
                .then(onChanged)
                .catch(() => {
                  setMoveFailed(true)
                })
                .finally(() => {
                  setMoving(false)
                })
            }}
            value={moment.entry.stageId ?? ''}
          >
            <option value="">{t('journey.noStage')}</option>
            {journey.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.title}
              </option>
            ))}
          </select>
          {moveFailed ? (
            <span className="mt-2 block text-sm text-destructive" role="alert">
              {t('journey.organizeMomentError')}
            </span>
          ) : null}
        </label>
      )}
      <button
        className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
        onClick={() => {
          onOpenEntry(moment.entry.id)
        }}
        type="button"
      >
        {t('journey.openMoment')}
      </button>
    </article>
  )
}

function EmptyJourneyState({ journeyId }: { journeyId: string }) {
  const { t } = useTranslation()

  return (
    <div className="mt-8 rounded-[1.5rem] border border-dashed border-border bg-surface p-6 shadow-soft">
      <h3 className="text-xl font-semibold">{t('journey.emptyTitle')}</h3>
      <p className="mt-3 max-w-2xl leading-7 text-muted">
        {t('journey.emptyRoute')}
      </p>
      <Link
        className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:w-auto"
        params={{ journeyId }}
        to="/j/$journeyId/memory/new"
      >
        <Plus aria-hidden="true" size={18} />
        {t('journey.addMoment')}
      </Link>
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
