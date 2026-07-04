import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Expand } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  JOURNEY_READER_SECTION_IDS,
  JOURNEY_READER_SCROLL_TARGETS,
  scrollToReaderSection,
  type JourneyReaderSection,
} from '@/features/journeys/lib/journey-reader-section'
import { pickJourneyCoverPhoto } from '@/features/journeys/lib/pick-journey-cover-photo'
import { useJourneyMomentPhotos } from '@/features/journeys/lib/use-journey-moment-photos'
import { JourneyGallery } from '@/features/journeys/ui/JourneyGallery'
import { DeferredJourneyMap } from '@/features/journeys/ui/DeferredJourneyMap'
import { JourneyGuidesSection } from '@/features/journeys/ui/JourneyGuidesSection'
import {
  JourneyMap,
  type JourneyMapView,
} from '@/features/journeys/ui/JourneyMap'
import { JourneyReaderDock } from '@/features/journeys/ui/JourneyReaderDock'
import { JourneyReaderHero } from '@/features/journeys/ui/JourneyReaderHero'
import { JourneyReaderStory } from '@/features/journeys/ui/JourneyReaderStory'
import { JourneyTagCollections } from '@/features/journeys/ui/JourneyTagCollections'
import { getJourneyMapPoints } from '@/features/journeys/ui/journey-map-points'
import { ReaderChrome } from '@/features/journeys/ui/ReaderChrome'
import { ReaderMapAttribution } from '@/features/journeys/ui/ReaderMapAttribution'
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
  const { t } = useTranslation()
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
    queryKey: ['journey-photo-tags', journeyId, 'assignments'],
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
    queryKey: [
      'journey-photo-locations',
      journeyId,
      ...(content?.moments.map((moment) => moment.entry.id) ?? []),
    ],
  })

  const { isPending: isMomentPhotosPending, photosByEntryId } =
    useJourneyMomentPhotos(content?.moments ?? [], content !== null, 'detail')
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
        : getJourneyMapPoints(
            content.moments,
            selectedCollectionTag === null ? content.plannedStops : [],
            filteredPhotoLocations,
            {
              checklistItems: checklistQuery.data ?? [],
              observations: observationsQuery.data ?? [],
            },
          ),
    [
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

  const photoCount = useMemo(() => {
    let count = 0
    for (const photos of photosByEntryId.values()) {
      count += photos.length
    }
    return count
  }, [photosByEntryId])

  const dateLabel = formatDateRange(
    journey?.startsAt ?? null,
    journey?.endsAt ?? null,
    t('journey.dateUnknown'),
  )

  useEffect(() => {
    if (section === undefined) {
      return
    }
    const timeout = window.setTimeout(() => {
      scrollToReaderSection(section)
    }, 120)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [section, journeyId])

  const pendingMapPointId =
    pendingMapPhotoId !== null ? `photo:${pendingMapPhotoId}` : null
  const mapFocusPointId =
    pendingMapPointId !== null &&
    mapPoints.some((point) => point.id === pendingMapPointId)
      ? pendingMapPointId
      : focusedMapPointId

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
    scrollToReaderSection('map')
  }

  const readerMapProps = {
    checklistItems: checklistQuery.data ?? [],
    collocatedSpread: 2.4,
    focusPointId: mapFocusPointId,
    focusZoom: false as const,
    fitPadding: READER_MAP_FIT_PADDING,
    maxFitZoom: 8,
    moments: content?.moments ?? [],
    observations: observationsQuery.data ?? [],
    onFocusPointChange: setFocusedMapPointId,
    onOpenEntry: openMoment,
    onViewChange: (view: JourneyMapView) => {
      mapViewRef.current = view
    },
    photoLocations: filteredPhotoLocations,
    photoThumbUrls,
    pinVariant: 'reader' as const,
    popupOffset: 24,
    showNatureGoals: showNatureGoalsOnMap,
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
      <main className="mx-auto min-h-svh w-full max-w-3xl px-5 py-16">
        <p className="text-muted">{t('journey.loading')}</p>
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
        dateLabel={dateLabel}
        mapPointCount={mapPoints.length}
        momentCount={content.moments.length}
        photoCount={photoCount}
        spaceHandle={publicPaths.spaceHandle}
        summary={journey.summary}
        title={journey.title}
      />

      <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">
        <section
          className="scroll-mt-24 py-14 sm:py-20"
          id={JOURNEY_READER_SECTION_IDS.story}
        >
          <ReaderSectionIntro
            eyebrow={t('reader.storyTimelineEyebrow')}
            title={t('reader.storyTitle')}
          />
          <JourneyReaderStory
            isPhotosPending={isMomentPhotosPending}
            onOpenEntry={openMoment}
            photosByEntryId={photosByEntryId}
            stageContents={content.stageContents}
            tagsByPhotoId={tagsByPhotoId}
          />
        </section>

        <section
          className="reader-map-section scroll-mt-24 border-t border-border/70 py-14 sm:py-20"
          id={JOURNEY_READER_SECTION_IDS.map}
        >
          <div
            className="mx-auto w-full max-w-3xl scroll-mt-28 px-5 sm:px-8"
            id={JOURNEY_READER_SCROLL_TARGETS.map}
          >
            <ReaderSectionIntro
              eyebrow={t('journey.mapEyebrow')}
              title={t('reader.mapTitle')}
            />
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              {t('reader.mapPhotoPinsHint')}
            </p>
            {mapPoints.some((point) => point.type === 'nature-goal') ? (
              <label className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted">
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
          </div>
          {mapPoints.length > 0 ? (
            <div className="reader-bleed relative mt-8">
              <DeferredJourneyMap
                {...readerMapProps}
                className="reader-map-frame reader-map-frame--bleed reader-map-frame--embedded h-[min(75vh,46rem)] w-full border-y border-border shadow-soft"
                plannedStops={content.plannedStops}
                sectionId={JOURNEY_READER_SECTION_IDS.map}
              />
              <button
                aria-label={t('journey.mapExpand')}
                className="absolute right-4 bottom-4 z-10 inline-flex min-h-11 items-center gap-2 rounded-full border border-border/80 bg-surface/95 px-4 text-sm font-semibold shadow-soft backdrop-blur-sm transition hover:bg-surface sm:right-6"
                onClick={openMapFullscreen}
                type="button"
              >
                <Expand aria-hidden="true" size={16} />
                {t('journey.mapExpand')}
              </button>
            </div>
          ) : (
            <p className="mx-auto mt-6 max-w-3xl rounded-2xl border border-dashed border-border bg-surface px-5 py-6 text-muted sm:px-8">
              {t('journey.mapEmpty')}
            </p>
          )}
          <div className="mx-auto mt-4 w-full max-w-3xl px-5 sm:px-8">
            <ReaderMapAttribution />
          </div>
        </section>

        <section
          className="scroll-mt-24 border-t border-border/70 py-14 sm:py-20"
          id={JOURNEY_READER_SECTION_IDS.gallery}
        >
          <ReaderSectionIntro
            eyebrow={t('journey.galleryEyebrow')}
            title={t('reader.galleryTitle')}
          />
          <JourneyGallery
            filterTagSlug={null}
            locatedPhotoIds={locatedPhotoIds}
            moments={content.moments}
            onOpenMoment={openMoment}
            onShowOnMap={handleShowPhotoOnMap}
            showPhotoEngagement
            tagAssignments={tagAssignmentsQuery.data ?? []}
            tagsByPhotoId={tagsByPhotoId}
          />
        </section>

        {hasCollections ? (
          <section
            className="scroll-mt-24 border-t border-border/70 py-14 sm:py-20"
            id={JOURNEY_READER_SECTION_IDS.collections}
          >
            <ReaderSectionIntro
              eyebrow={t('reader.collectionsEyebrow')}
              title={t('reader.collections')}
            />
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
              {t('reader.collectionsDescription')}
            </p>
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
            className="scroll-mt-24 border-t border-border/70 py-14 sm:py-20"
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

        <footer className="border-t border-border/70 py-14 sm:py-16">
          <ReaderSectionIntro
            eyebrow={t('reader.footerEyebrow')}
            title={t('reader.footerTitle')}
          />
          <ContentEngagement
            className="mt-8 rounded-[1.75rem] border border-border bg-surface p-5 shadow-soft sm:p-6"
            target={{ id: journeyId, type: 'journey' }}
          />
        </footer>
      </div>

      <JourneyReaderDock
        showCollections={hasCollections || tagAssignmentsQuery.isPending}
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
            plannedStops={content.plannedStops}
            syncView={null}
            syncViewToken={0}
            viewportPadding={READER_MAP_VIEWPORT_PADDING}
          />
        </div>
      </FullScreenSheet>
    </div>
  )
}

function ReaderSectionIntro({
  eyebrow,
  title,
}: {
  eyebrow: string
  title: string
}) {
  return (
    <div>
      <p className="text-sm font-medium tracking-[0.16em] text-accent uppercase">
        {eyebrow}
      </p>
      <h2 className="reader-display mt-3 text-3xl sm:text-4xl">{title}</h2>
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

export type { JourneyReaderSection } from '@/features/journeys/lib/journey-reader-section'
