import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Expand } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { natureQueryKeys } from '@/entities/nature/api/nature-query-keys'
import { photoQueryKeys } from '@/entities/photo/api/photo-query-keys'
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
import {
  JOURNEY_READER_SECTION_IDS,
  JOURNEY_READER_SCROLL_TARGETS,
  scrollToReaderSection,
  type JourneyReaderSection,
} from '@/features/journeys/lib/journey-reader-section'
import { buildPublicJourneyGallery } from '@/features/journeys/lib/public-journey-gallery'
import { pickJourneyCoverPhoto } from '@/features/journeys/lib/pick-journey-cover-photo'
import { useJourneyMomentPhotos } from '@/features/journeys/lib/use-journey-moment-photos'
import {
  getEntryIdFromMapPoint,
  getPublicJourneyMapPoints,
  resolvePublicJourneyMapBoundsCoordinates,
  resolvePublicMapFocusPointId,
  resolvePublicJourneyMapRoute,
} from '@/features/journeys/lib/public-journey-map'
import { JourneyGallery } from '@/features/journeys/ui/JourneyGallery'
import { DeferredJourneyMap } from '@/features/journeys/ui/DeferredJourneyMap'
import { JourneyGuidesSection } from '@/features/journeys/ui/JourneyGuidesSection'
import {
  JourneyMap,
  type JourneyMapView,
} from '@/features/journeys/ui/JourneyMap'
import { JourneyReaderClosingSection } from '@/features/journeys/ui/JourneyReaderClosingSection'
import { JourneyReaderDock } from '@/features/journeys/ui/JourneyReaderDock'
import { JourneyReaderGallery } from '@/features/journeys/ui/JourneyReaderGallery'
import { JourneyReaderHero } from '@/features/journeys/ui/JourneyReaderHero'
import { JourneyReaderStory } from '@/features/journeys/ui/JourneyReaderStory'
import {
  JourneyReaderMomentStrip,
  type JourneyReaderMomentStripHandle,
} from '@/features/journeys/ui/JourneyReaderMomentStrip'
import { JourneyTagCollections } from '@/features/journeys/ui/JourneyTagCollections'
import { ReaderChrome } from '@/features/journeys/ui/ReaderChrome'
import { ReaderMapAttribution } from '@/features/journeys/ui/ReaderMapAttribution'
import { countJourneyDays } from '@/features/journeys/lib/count-journey-days'
import {
  INITIAL_VISIBLE_MOMENTS,
  limitStageMoments,
} from '@/features/journeys/lib/limit-stage-moments'
import { SectionHeader } from '@/shared/ui/SectionHeader'
import { buttonVariants } from '@/shared/ui/button-variants'
import { cn } from '@/shared/lib/cn'
import {
  buildAbsoluteUrl,
  buildPublicJourneyPath,
  type PublicJourneyPaths,
} from '@/features/sharing/lib/public-paths'
import { ContentEngagement } from '@/features/engagement/ui/ContentEngagement'
import { usePhotoObjectUrls } from '@/features/photos/lib/use-photo-object-urls'
import { useDocumentMeta } from '@/shared/lib/use-document-meta'
import { FullScreenSheet } from '@/shared/ui/FullScreenSheet'

const READER_MAP_VIEWPORT_PADDING = {
  bottom: 40,
  left: 48,
  right: 48,
  top: 64,
} as const

const READER_MAP_FIT_PADDING = {
  bottom: 80,
  left: 104,
  right: 104,
  top: 168,
} as const

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
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const query = usePublicJourneyQuery(journeyId)
  const journey = query.data
  const content =
    journey === null || journey === undefined
      ? null
      : composeJourneyContent(journey)
  const [selectedCollectionTag, setSelectedCollectionTag] = useState<
    string | null
  >(null)
  const [mapExpanded, setMapExpanded] = useState(false)
  const mapViewRef = useRef<JourneyMapView | null>(null)
  const [fullscreenInitialView, setFullscreenInitialView] =
    useState<JourneyMapView | null>(null)
  const [embeddedSyncView, setEmbeddedSyncView] =
    useState<JourneyMapView | null>(null)
  const [embeddedMapSyncToken, setEmbeddedMapSyncToken] = useState(0)
  const stripRef = useRef<JourneyReaderMomentStripHandle>(null)
  const [activeMomentId, setActiveMomentId] = useState<string | null>(null)
  const [pendingMapPhotoId, setPendingMapPhotoId] = useState<string | null>(
    null,
  )
  const [visibleMomentCount, setVisibleMomentCount] = useState(
    INITIAL_VISIBLE_MOMENTS,
  )

  const observationsQuery = useQuery({
    enabled: journey !== null && journey !== undefined,
    queryFn: () => listJourneyObservations(journeyId),
    queryKey: natureQueryKeys.journeyObservations(journeyId),
  })
  const photoThumbUrls = useJourneyMapPhotoThumbs(content?.moments ?? [])

  const sharePath = buildPublicJourneyPath(publicPaths)
  const shareUrl = buildAbsoluteUrl(sharePath)
  const shareText = `${t('reader.shareTripMessage', {
    title: journey?.title ?? t('reader.shareFallbackTitle'),
  })}\n${shareUrl}`

  const documentMeta = useMemo(
    () =>
      journey === null || journey === undefined
        ? null
        : {
            description:
              journey.summary === ''
                ? t('reader.shareTripMessage', { title: journey.title })
                : journey.summary.slice(0, 160),
            title: journey.title,
          },
    [journey, t],
  )

  useDocumentMeta(documentMeta)

  const tagAssignmentsQuery = useQuery({
    enabled: journey !== null && journey !== undefined,
    queryFn: () => listJourneyPhotoTagAssignments(journeyId),
    queryKey: photoQueryKeys.journeyTagAssignments(journeyId),
  })
  const tagsByPhotoId = useMemo(
    () => groupTagsByPhotoId(tagAssignmentsQuery.data ?? []),
    [tagAssignmentsQuery.data],
  )
  const hasCollections = (tagAssignmentsQuery.data?.length ?? 0) > 0
  const hasGuides = (journey?.guides.length ?? 0) > 0

  const photoLocationsQuery = useQuery({
    enabled: content !== null && content.moments.length > 0,
    queryFn: () => getJourneyPhotoLocations(content?.moments ?? []),
    queryKey: photoQueryKeys.journeyPhotoLocations(
      journeyId,
      content?.moments.map((moment) => moment.entry.id) ?? [],
    ),
  })

  const { photosByEntryId } = useJourneyMomentPhotos(
    content?.moments ?? [],
    content !== null,
    'detail',
  )
  const coverPhoto = useMemo(
    () =>
      content === null
        ? null
        : pickJourneyCoverPhoto(content.moments, photosByEntryId),
    [content, photosByEntryId],
  )
  const coverUrls = usePhotoObjectUrls(coverPhoto === null ? [] : [coverPhoto])
  const coverUrl = coverUrls[0]?.url

  const filteredPhotoLocations = useMemo(
    () =>
      filterPhotoLocationsByTag(
        photoLocationsQuery.data ?? [],
        tagAssignmentsQuery.data ?? [],
        selectedCollectionTag,
      ),
    [photoLocationsQuery.data, selectedCollectionTag, tagAssignmentsQuery.data],
  )

  const mapPoints = useMemo(
    () =>
      content === null
        ? []
        : getPublicJourneyMapPoints(content.moments, filteredPhotoLocations),
    [content, filteredPhotoLocations],
  )

  const mapRoute = useMemo(
    () =>
      content === null
        ? { coordinates: [], source: 'none' as const }
        : resolvePublicJourneyMapRoute(content.moments, filteredPhotoLocations),
    [content, filteredPhotoLocations],
  )

  const mapBoundsCoordinates = useMemo(
    () =>
      content === null
        ? []
        : resolvePublicJourneyMapBoundsCoordinates(
            content.moments,
            filteredPhotoLocations,
            mapPoints,
          ),
    [content, filteredPhotoLocations, mapPoints],
  )

  const locatedPhotoIds = useMemo(
    () => new Set((photoLocationsQuery.data ?? []).map((photo) => photo.id)),
    [photoLocationsQuery.data],
  )

  const publicGallery = useMemo(
    () =>
      content === null
        ? null
        : buildPublicJourneyGallery({
            locale: i18n.language,
            photosByEntryId,
            stageContents: content.stageContents,
            t,
          }),
    [content, i18n.language, photosByEntryId, t],
  )
  const showGallery = (publicGallery?.flatImages.length ?? 0) > 0
  const photoCount = publicGallery?.flatImages.length ?? 0
  const dayCount = countJourneyDays(
    journey?.startsAt ?? null,
    journey?.endsAt ?? null,
  )
  const limitedStory =
    content === null
      ? null
      : limitStageMoments(content.stageContents, visibleMomentCount)

  useEffect(() => {
    if (section === undefined) {
      return
    }
    const timeout = window.setTimeout(() => {
      if (
        section === 'gallery' &&
        !showGallery &&
        document.getElementById(JOURNEY_READER_SECTION_IDS.gallery) === null
      ) {
        scrollToReaderSection('story')
        return
      }
      scrollToReaderSection(section)
    }, 120)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [section, journeyId, showGallery])

  const focusPointId = useMemo(
    () =>
      resolvePublicMapFocusPointId(
        activeMomentId,
        pendingMapPhotoId,
        mapPoints,
      ),
    [activeMomentId, mapPoints, pendingMapPhotoId],
  )

  function handleFocusPointChange(pointId: string | null) {
    if (pointId === null) {
      setActiveMomentId(null)
      setPendingMapPhotoId(null)
      return
    }

    const entryId = getEntryIdFromMapPoint(pointId, mapPoints)
    if (entryId !== null) {
      setActiveMomentId(entryId)
      setPendingMapPhotoId(null)
      stripRef.current?.scrollToMoment(entryId)
    }
  }

  function handleActivateMoment(entryId: string) {
    setActiveMomentId(entryId)
    setPendingMapPhotoId(null)
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
    const photoLocation = (photoLocationsQuery.data ?? []).find(
      (photo) => photo.id === photoId,
    )
    setPendingMapPhotoId(photoId)
    if (photoLocation !== undefined) {
      setActiveMomentId(photoLocation.entryId)
      stripRef.current?.scrollToMoment(photoLocation.entryId)
    }
    scrollToReaderSection('map')
  }

  const readerMapProps = {
    boundsCoordinates: mapBoundsCoordinates,
    checklistItems: [],
    collocatedSpread: 2.4,
    focusPointId,
    focusZoom: false as const,
    fitPadding: READER_MAP_FIT_PADDING,
    maxFitZoom: 8,
    moments: content?.moments ?? [],
    observations: [],
    onFocusPointChange: handleFocusPointChange,
    onOpenEntry: openMoment,
    onViewChange: (view: JourneyMapView) => {
      mapViewRef.current = view
    },
    photoLocations: filteredPhotoLocations,
    photoThumbUrls,
    pinVariant: 'reader' as const,
    popupOffset: 24,
    plannedStops: [],
    routeLine:
      mapRoute.coordinates.length >= 2
        ? {
            coordinates: mapRoute.coordinates,
            source: mapRoute.source,
          }
        : null,
    showNatureGoals: false,
    singlePointZoom: 8,
    syncView: embeddedSyncView,
    syncViewToken: embeddedMapSyncToken,
    viewportPadding: READER_MAP_VIEWPORT_PADDING,
  }

  function openMapFullscreen() {
    setFullscreenInitialView(mapViewRef.current)
    setMapExpanded(true)
  }

  function closeMapFullscreen() {
    setEmbeddedSyncView(mapViewRef.current)
    setEmbeddedMapSyncToken((token) => token + 1)
    setMapExpanded(false)
  }

  const collectionSpecies =
    selectedCollectionTag === null
      ? []
      : uniqueSpeciesNames(
          observationsForCollectionTag(
            observationsQuery.data ?? [],
            selectedCollectionTag,
          ),
        )

  if (query.isError) {
    return (
      <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-16">
        <p className="text-destructive">{t('journey.error')}</p>
      </main>
    )
  }

  if (query.isLoading) {
    return (
      <main className="mx-auto min-h-svh w-full max-w-4xl px-5 py-16">
        <div
          aria-hidden="true"
          className="reader-photo-placeholder aspect-[16/9] rounded-[1.5rem]"
        />
        <p className="mt-6 text-muted">{t('journey.loading')}</p>
      </main>
    )
  }

  if (journey == null || content === null) {
    return (
      <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-16">
        <p className="text-muted">{t('journey.notFound')}</p>
      </main>
    )
  }

  return (
    <div className="reader-page pb-28">
      <ReaderChrome
        shareText={shareText}
        shareUrl={shareUrl}
        spaceHandle={publicPaths.spaceHandle}
        title={journey.title}
      />

      <JourneyReaderHero
        {...(coverUrl !== undefined ? { coverUrl } : {})}
        {...(dayCount === null ? {} : { dayCount })}
        mapPointCount={mapPoints.length}
        momentCount={content.moments.length}
        photoCount={photoCount}
        summary={journey.summary}
        title={journey.title}
      />

      <div className="reader-page__content mx-auto w-full max-w-3xl px-5 sm:px-8 lg:max-w-4xl">
        <section
          aria-labelledby="reader-trip-stages-heading"
          className="scroll-mt-24 py-10 sm:py-14"
          id={JOURNEY_READER_SECTION_IDS.story}
        >
          <SectionHeader
            eyebrow={t('reader.timelineEyebrow')}
            headingId="reader-trip-stages-heading"
            title={t('reader.timelineTitle')}
          />
          <JourneyReaderStory
            activeMomentId={activeMomentId}
            onOpenEntry={openMoment}
            photosByEntryId={photosByEntryId}
            stageContents={limitedStory?.stages ?? content.stageContents}
            tagsByPhotoId={tagsByPhotoId}
          />
          {(limitedStory?.hiddenCount ?? 0) > 0 ? (
            <div className="mt-8 flex justify-center">
              <button
                className={cn(buttonVariants({ variant: 'secondary' }))}
                onClick={() => {
                  setVisibleMomentCount(
                    (current) => current + INITIAL_VISIBLE_MOMENTS,
                  )
                }}
                type="button"
              >
                {t('reader.showMoreMomentsCount', {
                  count: limitedStory?.hiddenCount ?? 0,
                })}
              </button>
            </div>
          ) : null}
        </section>

        <section
          className="reader-map-section scroll-mt-24 py-10 sm:py-14"
          id={JOURNEY_READER_SECTION_IDS.map}
        >
          <div className="scroll-mt-28" id={JOURNEY_READER_SCROLL_TARGETS.map}>
            <SectionHeader
              description={t('reader.mapInteractionHint')}
              eyebrow={t('journey.mapEyebrow')}
              title={t('reader.mapTitle')}
            />
          </div>
          {mapPoints.length > 0 ? (
            <div className="editorial-map-frame relative mt-8 h-[min(28rem,70vh)]">
              <DeferredJourneyMap
                {...readerMapProps}
                className="reader-map-frame h-full w-full"
                sectionId={JOURNEY_READER_SECTION_IDS.map}
              />
              <button
                aria-label={t('reader.mapViewAction')}
                className="absolute right-4 bottom-4 z-10 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border/80 bg-surface/95 px-4 text-sm font-semibold shadow-soft backdrop-blur-sm transition hover:bg-white"
                onClick={openMapFullscreen}
                type="button"
              >
                <Expand aria-hidden="true" size={16} />
                {t('reader.mapViewAction')}
              </button>
            </div>
          ) : (
            <p className="mt-6 text-muted">{t('journey.mapEmpty')}</p>
          )}
          {content.moments.length > 0 ? (
            <JourneyReaderMomentStrip
              activeMomentId={activeMomentId}
              moments={content.moments}
              onActivateMoment={handleActivateMoment}
              ref={stripRef}
            />
          ) : null}
          <div className="mt-4">
            <ReaderMapAttribution />
          </div>
        </section>

        {showGallery ? (
          <section
            className="scroll-mt-24 py-10 sm:py-14"
            id={JOURNEY_READER_SECTION_IDS.gallery}
          >
            <SectionHeader
              eyebrow={t('journey.galleryEyebrow')}
              title={t('reader.galleryTitle')}
            />
            <JourneyReaderGallery
              layout="preview"
              onOpenMoment={openMoment}
              stageContents={content.stageContents}
            />
          </section>
        ) : null}

        {hasCollections ? (
          <section
            className="scroll-mt-24 py-10 sm:py-14"
            id={JOURNEY_READER_SECTION_IDS.collections}
          >
            <SectionHeader
              description={t('reader.collectionsDescription')}
              eyebrow={t('reader.collectionsEyebrow')}
              title={t('reader.collections')}
            />
            {selectedCollectionTag === null ? (
              <JourneyTagCollections
                journeyId={journeyId}
                observations={observationsQuery.data ?? []}
                onSelectTag={setSelectedCollectionTag}
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
                <h3 className="reader-display mt-4 text-2xl">
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
                  moments={content.moments}
                  onOpenMoment={openMoment}
                  onShowOnMap={handleShowPhotoOnMap}
                  showPhotoEngagement
                  tagAssignments={tagAssignmentsQuery.data ?? []}
                  tagsByPhotoId={tagsByPhotoId}
                />
              </>
            )}
          </section>
        ) : null}

        {hasGuides ? (
          <section
            className="scroll-mt-24 py-10 sm:py-14"
            id={JOURNEY_READER_SECTION_IDS.guides}
          >
            <JourneyGuidesSection
              canEdit={false}
              creatorId=""
              journey={journey}
              onChanged={() => {
                // Read-only journey view has no local edits to sync.
              }}
            />
          </section>
        ) : null}

        <JourneyReaderClosingSection
          shareUrl={shareUrl}
          spaceHandle={publicPaths.spaceHandle}
          title={journey.title}
        />

        <footer className="py-10 sm:py-14">
          <SectionHeader
            eyebrow={t('reader.footerEyebrow')}
            title={t('reader.footerTitle')}
          />
          <ContentEngagement
            className="mt-6 min-h-32"
            target={{ id: journeyId, type: 'journey' }}
          />
        </footer>
      </div>

      <JourneyReaderDock
        showCollections={hasCollections || tagAssignmentsQuery.isPending}
        showGallery={showGallery}
        showGuides={hasGuides}
      />

      <FullScreenSheet
        closeLabel={t('journey.mapCollapse')}
        onClose={closeMapFullscreen}
        open={mapExpanded}
        scrollable={false}
        title={t('journey.map')}
      >
        <div className="reader-map-frame reader-map-frame--fullscreen flex min-h-0 flex-1 flex-col">
          <JourneyMap
            {...readerMapProps}
            className="h-full min-h-0 w-full flex-1"
            initialView={fullscreenInitialView}
            onOpenEntry={(entryId) => {
              closeMapFullscreen()
              openMoment(entryId)
            }}
            onViewChange={(view) => {
              mapViewRef.current = view
            }}
            syncView={null}
            syncViewToken={0}
            viewportPadding={READER_MAP_VIEWPORT_PADDING}
          />
        </div>
      </FullScreenSheet>
    </div>
  )
}

export type { JourneyReaderSection } from '@/features/journeys/lib/journey-reader-section'
