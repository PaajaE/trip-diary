import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CalendarDays, Expand } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listJourneyChecklistItems } from '@/entities/checklist/api/checklist-mutation.repository'
import { listJourneyObservations } from '@/entities/nature/api/observation.repository'
import { listJourneyPhotoTagAssignments } from '@/entities/photo/api/photo-tag.repository'
import { getJourneyPhotoLocations } from '@/entities/photo/api/photo-location.repository'
import { usePublicJourneyQuery } from '@/entities/journey/api/use-journey-query'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'
import {
  observationsForCollectionTag,
  uniqueSpeciesNames,
} from '@/features/journeys/lib/collection-observations'
import { useJourneyMapPhotoThumbs } from '@/features/journeys/lib/use-journey-map-photo-thumbs'
import {
  filterPhotoLocationsByTag,
  groupTagsByPhotoId,
} from '@/features/journeys/lib/journey-tag-collections'
import { scrollToJourneySectionNav } from '@/features/journeys/lib/scroll-to-journey-section-nav'
import { JourneyGallery } from '@/features/journeys/ui/JourneyGallery'
import { JourneyGuidesSection } from '@/features/journeys/ui/JourneyGuidesSection'
import { JourneyMap } from '@/features/journeys/ui/JourneyMap'
import { JourneyOverview } from '@/features/journeys/ui/JourneyOverview'
import { JourneyReaderSectionTabs } from '@/features/journeys/ui/JourneyReaderSectionTabs'
import type { JourneyReaderSection } from '@/features/journeys/ui/JourneyReaderSectionTabs'
import { JourneyReaderStory } from '@/features/journeys/ui/JourneyReaderStory'
import { JourneyTagCollections } from '@/features/journeys/ui/JourneyTagCollections'
import { getJourneyMapPoints } from '@/features/journeys/ui/journey-map-points'
import {
  buildAbsoluteUrl,
  buildPublicJourneyPath,
  type PublicJourneyPaths,
} from '@/features/sharing/lib/public-paths'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { ShareActions } from '@/features/sharing/ui/ShareActions'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'
import { FullScreenSheet } from '@/shared/ui/FullScreenSheet'

interface JourneyReaderPageProps {
  journeyId: string
  publicPaths: PublicJourneyPaths
  section?: JourneyReaderSection
}

export function JourneyReaderPage({
  journeyId,
  publicPaths,
  section,
}: JourneyReaderPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const query = usePublicJourneyQuery(journeyId)
  const journey = query.data
  const content =
    journey === null || journey === undefined
      ? null
      : composeJourneyContent(journey)
  const [activeSection, setActiveSection] = useState<JourneyReaderSection>(
    section ?? 'overview',
  )
  const [syncedRoute, setSyncedRoute] = useState({ journeyId, section })
  const [selectedCollectionTag, setSelectedCollectionTag] = useState<
    string | null
  >(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [focusedMapPointId, setFocusedMapPointId] = useState<string | null>(
    null,
  )
  const [pendingMapPhotoId, setPendingMapPhotoId] = useState<string | null>(
    null,
  )
  const [showNatureGoalsOnMap, setShowNatureGoalsOnMap] = useState(true)

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
  const photoThumbUrls = useJourneyMapPhotoThumbs(content?.moments ?? [])

  const sharePath = buildPublicJourneyPath(publicPaths)
  const shareUrl = buildAbsoluteUrl(sharePath)
  const shareText = `${t('reader.shareTripMessage', {
    title: journey?.title ?? t('reader.shareFallbackTitle'),
  })}\n${shareUrl}`

  useDocumentMeta(
    journey === null || journey === undefined
      ? null
      : {
          description:
            journey.summary === ''
              ? t('reader.shareTripMessage', { title: journey.title })
              : journey.summary.slice(0, 160),
          title: journey.title,
        },
  )

  const tagAssignmentsQuery = useQuery({
    enabled: journey !== null && journey !== undefined,
    queryFn: () => listJourneyPhotoTagAssignments(journeyId),
    queryKey: ['journey-photo-tags', journeyId, 'assignments'],
  })
  const tagsByPhotoId = useMemo(
    () => groupTagsByPhotoId(tagAssignmentsQuery.data ?? []),
    [tagAssignmentsQuery.data],
  )
  const hasCollections = (tagAssignmentsQuery.data?.length ?? 0) > 0

  const photoLocationsQuery = useQuery({
    enabled: content !== null && content.moments.length > 0,
    queryFn: () => getJourneyPhotoLocations(content?.moments ?? []),
    queryKey: [
      'journey-photo-locations',
      journeyId,
      ...(content?.moments.map((moment) => moment.entry.id) ?? []),
    ],
  })

  const filteredPhotoLocations = useMemo(
    () =>
      filterPhotoLocationsByTag(
        photoLocationsQuery.data ?? [],
        tagAssignmentsQuery.data ?? [],
        activeSection === 'collections' ? selectedCollectionTag : null,
      ),
    [
      activeSection,
      photoLocationsQuery.data,
      selectedCollectionTag,
      tagAssignmentsQuery.data,
    ],
  )

  const mapPoints = useMemo(
    () =>
      content === null
        ? []
        : getJourneyMapPoints(
            content.moments,
            activeSection === 'collections' && selectedCollectionTag !== null
              ? []
              : content.plannedStops,
            filteredPhotoLocations,
            {
              checklistItems: checklistQuery.data ?? [],
              observations: observationsQuery.data ?? [],
            },
          ),
    [
      activeSection,
      checklistQuery.data,
      content,
      filteredPhotoLocations,
      observationsQuery.data,
      selectedCollectionTag,
    ],
  )

  const locatedPhotoIds = useMemo(
    () => new Set((photoLocationsQuery.data ?? []).map((photo) => photo.id)),
    [photoLocationsQuery.data],
  )

  const dateLabel = formatDateRange(
    journey?.startsAt ?? null,
    journey?.endsAt ?? null,
    t('journey.dateUnknown'),
  )

  if (syncedRoute.journeyId !== journeyId || syncedRoute.section !== section) {
    setSyncedRoute({ journeyId, section })
    setActiveSection(section ?? 'overview')
    setSelectedCollectionTag(null)
    setMapExpanded(false)
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
  }, [activeSection, selectedCollectionTag])

  function selectSection(next: JourneyReaderSection) {
    setActiveSection(next)
    if (next !== 'collections') {
      setSelectedCollectionTag(null)
    }
    if (next !== 'map') {
      setMapExpanded(false)
    }
  }

  function openMoment(entryId: string) {
    const moment = content?.moments.find((item) => item.entry.id === entryId)
    const entrySlug = moment?.entry.slug
    if (entrySlug === null || entrySlug === undefined) {
      return
    }
    void navigate({
      params: {
        entrySlug,
        journeySlug: publicPaths.journeySlug,
        spaceHandle: publicPaths.spaceHandle,
      },
      to: '/$spaceHandle/$journeySlug/$entrySlug',
    })
  }

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

  function handleSelectCollectionTag(slug: string) {
    setSelectedCollectionTag(slug)
  }

  const collectionFilterTag =
    activeSection === 'collections' ? selectedCollectionTag : null
  const collectionSpecies =
    selectedCollectionTag === null
      ? []
      : uniqueSpeciesNames(
          observationsForCollectionTag(
            observationsQuery.data ?? [],
            selectedCollectionTag,
          ),
        )

  const readerMapProps = {
    checklistItems: checklistQuery.data ?? [],
    focusPointId: mapFocusPointId,
    moments: content?.moments ?? [],
    observations: observationsQuery.data ?? [],
    onFocusPointChange: setFocusedMapPointId,
    onOpenEntry: openMoment,
    photoLocations: filteredPhotoLocations,
    photoThumbUrls,
    showNatureGoals: showNatureGoalsOnMap,
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
          <header className="mt-10 overflow-hidden rounded-[2rem] border border-border bg-surface shadow-soft">
            <div className="bg-[radial-gradient(circle_at_top_left,_rgba(184,95,66,0.18),_transparent_36%),linear-gradient(135deg,_rgba(40,88,69,0.12),_rgba(255,253,248,0.8))] px-5 py-6 sm:px-8 sm:py-8">
              <p className="text-sm font-medium text-accent">
                {t(`journey.status.${journey.status}`)}
              </p>
              <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
                {journey.title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-2">
                  <CalendarDays aria-hidden="true" size={16} />
                  {dateLabel}
                </span>
                <Link
                  className="inline-flex items-center rounded-full bg-white/80 px-3 py-2 font-semibold text-primary hover:underline"
                  params={{ spaceHandle: publicPaths.spaceHandle }}
                  to="/$spaceHandle"
                >
                  @{publicPaths.spaceHandle}
                </Link>
              </div>
              <ShareActions
                className="mt-5"
                shareText={shareText}
                shareUrl={shareUrl}
                title={journey.title}
              />
            </div>
          </header>

          <JourneyReaderSectionTabs
            activeSection={activeSection}
            onSelect={selectSection}
            showCollections={hasCollections || tagAssignmentsQuery.isPending}
          />

          <ContentEngagement
            className="mt-6 rounded-[1.5rem] border border-border bg-surface p-5 shadow-soft sm:p-6"
            target={{ id: journeyId, type: 'journey' }}
          />

          {activeSection === 'overview' && content !== null ? (
            <JourneyOverview
              canEdit={false}
              creatorId=""
              journey={journey}
              journeyId={journeyId}
              mapPointCount={mapPoints.length}
              moments={content.moments}
              onChanged={() => {
                // Read-only public view.
              }}
              onNavigateSection={(next) => {
                if (
                  next === 'overview' ||
                  next === 'map' ||
                  next === 'gallery'
                ) {
                  selectSection(next)
                }
              }}
              onOpenEntry={openMoment}
              onShowNatureOnMap={handleShowNatureOnMap}
              stageContents={content.stageContents}
              tagsByPhotoId={tagsByPhotoId}
            />
          ) : null}

          {activeSection === 'story' && content !== null ? (
            <section className="py-8 sm:py-10" id="story">
              <SectionHeading
                eyebrow={t('journey.storyEyebrow')}
                title={t('journey.story')}
              />
              <JourneyReaderStory
                onOpenEntry={openMoment}
                stageContents={content.stageContents}
                tagsByPhotoId={tagsByPhotoId}
              />
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
              {mapPoints.length > 0 && !mapExpanded ? (
                <JourneyMap
                  {...readerMapProps}
                  plannedStops={
                    collectionFilterTag === null
                      ? (content?.plannedStops ?? [])
                      : []
                  }
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
                filterTagSlug={null}
                locatedPhotoIds={locatedPhotoIds}
                moments={content?.moments ?? []}
                onOpenMoment={openMoment}
                onShowOnMap={handleShowPhotoOnMap}
                showPhotoEngagement
                tagAssignments={tagAssignmentsQuery.data ?? []}
                tagsByPhotoId={tagsByPhotoId}
              />
            </section>
          ) : null}

          {activeSection === 'collections' ? (
            <section className="py-8 sm:py-10" id="collections">
              <SectionHeading
                eyebrow={t('reader.collectionsEyebrow')}
                title={t('reader.collections')}
              />
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                {t('reader.collectionsDescription')}
              </p>
              {selectedCollectionTag === null ? (
                <JourneyTagCollections
                  journeyId={journeyId}
                  observations={observationsQuery.data ?? []}
                  onSelectTag={handleSelectCollectionTag}
                  selectedTagSlug={selectedCollectionTag}
                />
              ) : (
                <>
                  <button
                    className="mt-6 text-sm font-semibold text-primary hover:underline"
                    onClick={() => {
                      setSelectedCollectionTag(null)
                    }}
                    type="button"
                  >
                    {t('reader.backToCollections')}
                  </button>
                  <h3 className="mt-4 text-xl font-semibold">
                    {
                      tagAssignmentsQuery.data?.find(
                        (tag) => tag.slug === selectedCollectionTag,
                      )?.label
                    }
                  </h3>
                  {collectionSpecies.length > 0 ? (
                    <ul className="mt-4 flex flex-wrap gap-2">
                      {collectionSpecies.map((name) => (
                        <li
                          className="rounded-full bg-primary/8 px-3 py-1.5 text-sm font-medium text-primary"
                          key={name}
                        >
                          {name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <JourneyGallery
                    filterTagSlug={selectedCollectionTag}
                    locatedPhotoIds={locatedPhotoIds}
                    moments={content?.moments ?? []}
                    onOpenMoment={openMoment}
                    onShowOnMap={handleShowPhotoOnMap}
                    showPhotoEngagement
                    tagAssignments={tagAssignmentsQuery.data ?? []}
                    tagsByPhotoId={tagsByPhotoId}
                  />
                  <div className="mt-10">
                    <h4 className="text-lg font-semibold">
                      {t('reader.collectionMapTitle')}
                    </h4>
                    {mapPoints.length > 0 ? (
                      <JourneyMap
                        {...readerMapProps}
                        className="mt-4"
                        plannedStops={[]}
                      />
                    ) : (
                      <p className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-6 text-sm text-muted">
                        {t('reader.collectionMapEmpty')}
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>
          ) : null}

          {activeSection === 'guides' ? (
            <JourneyGuidesSection
              canEdit={false}
              creatorId=""
              journey={journey}
              onChanged={() => {
                // Read-only journey view has no local edits to sync.
              }}
            />
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
              {...readerMapProps}
              className="min-h-0 flex-1"
              onOpenEntry={(entryId) => {
                setMapExpanded(false)
                openMoment(entryId)
              }}
              plannedStops={content?.plannedStops ?? []}
            />
          </FullScreenSheet>
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
