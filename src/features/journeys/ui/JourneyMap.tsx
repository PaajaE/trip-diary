import type { TFunction } from 'i18next'
import type { RefObject } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTranslation } from 'react-i18next'
import {
  computeJourneyStopMapCamera,
  type MapCoordinate,
} from '@trip-diary/utils'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { NatureObservation } from '@/entities/nature/model/observation'
import type { JourneyPhotoLocation } from '@/entities/photo/api/photo-location.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import type { JourneyMapRouteSource } from '@/features/journeys/lib/journey-map-route'
import {
  createJourneyMapPinElement,
  refreshJourneyMapPinElement,
} from '@/features/journeys/ui/journey-map-photo-marker'
import {
  getJourneyMapPoints,
  type JourneyMapPoint,
} from '@/features/journeys/ui/journey-map-points'
import { getAppMapStyle } from '@/shared/lib/map-style'

export interface JourneyMapView {
  center: [number, number]
  zoom: number
}

interface JourneyMapProps {
  boundsCoordinates?: MapCoordinate[] | null
  canEdit?: boolean
  checklistItems?: JourneyChecklistItem[]
  className?: string
  collocatedSpread?: number
  focusPointId?: string | null
  focusZoom?: number | false
  fitPadding?: number | maplibregl.PaddingOptions
  initialView?: JourneyMapView | null
  maxFitZoom?: number
  moments: JourneyMoment[]
  observations?: NatureObservation[]
  onFocusPointChange?: (pointId: string | null) => void
  onMarkNatureGoalSpotted?: (item: JourneyChecklistItem) => void
  onOpenEntry?: (entryId: string) => void
  onViewChange?: (view: JourneyMapView) => void
  photoLocations: JourneyPhotoLocation[]
  photoThumbUrls?: Record<string, string>
  pinVariant?: 'default' | 'reader'
  plannedStops: JourneyDetail['stops']
  popupOffset?: number
  routeLine?: {
    coordinates: MapCoordinate[]
    source: JourneyMapRouteSource
  } | null
  showNatureGoals?: boolean
  singlePointZoom?: number
  syncView?: JourneyMapView | null
  syncViewToken?: number
  viewportPadding?: maplibregl.PaddingOptions
}

interface MapInteractionContext {
  canEdit: boolean
  checklistItems: JourneyChecklistItem[]
  focusZoom: number | false
  onFocusPointChange?: ((pointId: string | null) => void) | undefined
  onMarkNatureGoalSpotted?: ((item: JourneyChecklistItem) => void) | undefined
  onOpenEntry?: ((entryId: string) => void) | undefined
  photoThumbUrls: Record<string, string>
  pinVariant: 'default' | 'reader'
  points: JourneyMapPoint[]
  popupOffset: number
  t: TFunction
}

interface MapViewOptions {
  collocatedSpread: number
  fitPadding: number | maplibregl.PaddingOptions
  maxFitZoom: number
  pinVariant: 'default' | 'reader'
  singlePointZoom: number
  viewportPadding: maplibregl.PaddingOptions
}

export function JourneyMap({
  boundsCoordinates = null,
  canEdit = false,
  checklistItems = [],
  className = 'mt-8 h-80 overflow-hidden rounded-lg border border-border sm:h-96',
  collocatedSpread = 1,
  focusPointId = null,
  focusZoom = 14,
  fitPadding = 56,
  initialView = null,
  maxFitZoom = 11,
  moments,
  observations = [],
  onFocusPointChange,
  onMarkNatureGoalSpotted,
  onOpenEntry,
  onViewChange,
  photoLocations,
  photoThumbUrls = {},
  pinVariant = 'default',
  plannedStops,
  popupOffset = 18,
  routeLine = null,
  showNatureGoals = true,
  singlePointZoom = 10,
  syncView = null,
  syncViewToken = 0,
  viewportPadding = { bottom: 0, left: 0, right: 0, top: 0 },
}: JourneyMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const activePopupRef = useRef<maplibregl.Popup | null>(null)
  const layersReadyRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const hasAutoFitRef = useRef(false)
  const lastFocusedPointIdRef = useRef<string | null>(null)
  const focusPointIdRef = useRef(focusPointId)
  const initialViewRef = useRef(initialView)
  const onViewChangeRef = useRef(onViewChange)
  const boundsCoordinatesRef = useRef(boundsCoordinates)
  const routeLineRef = useRef(routeLine)
  useEffect(() => {
    focusPointIdRef.current = focusPointId
  }, [focusPointId])
  useEffect(() => {
    initialViewRef.current = initialView
  }, [initialView])
  useEffect(() => {
    onViewChangeRef.current = onViewChange
  }, [onViewChange])
  useEffect(() => {
    boundsCoordinatesRef.current = boundsCoordinates
  }, [boundsCoordinates])
  useEffect(() => {
    routeLineRef.current = routeLine
  }, [routeLine])

  function publishViewChange(activeMap: maplibregl.Map) {
    const center = activeMap.getCenter()
    onViewChangeRef.current?.({
      center: [center.lng, center.lat],
      zoom: activeMap.getZoom(),
    })
  }

  const interactionRef = useRef<MapInteractionContext>({
    canEdit,
    checklistItems,
    focusZoom,
    photoThumbUrls,
    pinVariant,
    points: [],
    popupOffset,
    t,
  })
  const viewOptionsRef = useRef<MapViewOptions>({
    collocatedSpread,
    fitPadding,
    maxFitZoom,
    pinVariant,
    singlePointZoom,
    viewportPadding,
  })
  const viewportPaddingRef = useRef(viewportPadding)
  const points = useMemo(
    () =>
      getJourneyMapPoints(moments, plannedStops, photoLocations, {
        checklistItems,
        observations,
      }).filter((point) => showNatureGoals || point.type !== 'nature-goal'),
    [
      checklistItems,
      moments,
      observations,
      photoLocations,
      plannedStops,
      showNatureGoals,
    ],
  )
  const displayPoints = useMemo(
    () => layoutCollocatedPoints(points, collocatedSpread),
    [collocatedSpread, points],
  )

  useEffect(() => {
    viewOptionsRef.current = {
      collocatedSpread,
      fitPadding,
      maxFitZoom,
      pinVariant,
      singlePointZoom,
      viewportPadding,
    }
    viewportPaddingRef.current = viewportPadding
  }, [
    collocatedSpread,
    fitPadding,
    maxFitZoom,
    pinVariant,
    singlePointZoom,
    viewportPadding,
  ])

  useEffect(() => {
    interactionRef.current = {
      canEdit,
      checklistItems,
      focusZoom,
      onFocusPointChange,
      onMarkNatureGoalSpotted,
      onOpenEntry,
      photoThumbUrls,
      pinVariant,
      points,
      popupOffset,
      t,
    }
  }, [
    canEdit,
    checklistItems,
    focusZoom,
    onFocusPointChange,
    onMarkNatureGoalSpotted,
    onOpenEntry,
    photoThumbUrls,
    pinVariant,
    points,
    popupOffset,
    t,
  ])

  useEffect(() => {
    const markers = markersRef.current
    const container = containerRef.current
    if (container === null) {
      return
    }

    const map = new maplibregl.Map({
      attributionControl: false,
      center: [14, 50],
      container,
      style: getAppMapStyle(i18n.language),
      zoom: 5,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    const onLoad = () => {
      layersReadyRef.current = true
      applyMapViewportPadding(map, viewOptionsRef.current.viewportPadding)
      syncRouteLayer(map, routeLineRef.current)
      setMapReady(true)
      syncPhotoMarkers(
        map,
        layoutCollocatedPoints(
          interactionRef.current.points,
          viewOptionsRef.current.collocatedSpread,
        ),
        markersRef,
        interactionRef,
        activePopupRef,
        (point) => {
          showPointPopup(point, map, interactionRef, activePopupRef, markersRef)
        },
      )
      const fittedDisplayPoints = layoutCollocatedPoints(
        interactionRef.current.points,
        viewOptionsRef.current.collocatedSpread,
      )
      const savedView = initialViewRef.current
      if (savedView !== null) {
        map.jumpTo({
          center: savedView.center,
          zoom: savedView.zoom,
        })
        hasAutoFitRef.current = true
        publishViewChange(map)
      } else {
        const first = fittedDisplayPoints[0]
        if (first !== undefined && focusPointIdRef.current === null) {
          fitMapViewport(
            map,
            fittedDisplayPoints,
            boundsCoordinatesRef.current,
            viewOptionsRef.current,
          )
          hasAutoFitRef.current = true
          publishViewChange(map)
        }
      }
    }

    if (map.loaded()) {
      onLoad()
    } else {
      void map.once('load', onLoad)
    }

    return () => {
      activePopupRef.current?.remove()
      activePopupRef.current = null
      for (const marker of markers.values()) {
        marker.remove()
      }
      markers.clear()
      layersReadyRef.current = false
      setMapReady(false)
      hasAutoFitRef.current = false
      lastFocusedPointIdRef.current = null
      mapRef.current = null
      window.setTimeout(() => {
        try {
          map.remove()
        } catch {
          // WebView may already have torn down the map surface.
        }
      }, 0)
    }
  }, [i18n.language])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || !mapReady || !layersReadyRef.current || !map.loaded()) {
      return
    }

    syncPhotoMarkers(
      map,
      displayPoints,
      markersRef,
      interactionRef,
      activePopupRef,
      (point) => {
        showPointPopup(point, map, interactionRef, activePopupRef, markersRef)
      },
    )

    if (
      focusPointId === null &&
      !hasAutoFitRef.current &&
      initialViewRef.current === null &&
      points.length > 0
    ) {
      fitMapViewport(
        map,
        displayPoints,
        boundsCoordinatesRef.current,
        viewOptionsRef.current,
      )
      hasAutoFitRef.current = true
      publishViewChange(map)
    }
  }, [displayPoints, focusPointId, mapReady, photoThumbUrls, points.length])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || !mapReady || !layersReadyRef.current || !map.loaded()) {
      return
    }

    syncRouteLayer(map, routeLine)
  }, [mapReady, routeLine])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || !mapReady) {
      return
    }

    const onMoveEnd = () => {
      publishViewChange(map)
    }

    map.on('moveend', onMoveEnd)
    return () => {
      map.off('moveend', onMoveEnd)
    }
  }, [mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || !mapReady || syncView === null || syncViewToken === 0) {
      return
    }

    map.jumpTo({
      center: syncView.center,
      zoom: syncView.zoom,
    })
  }, [mapReady, syncView, syncViewToken])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || !mapReady) {
      return
    }

    applyMapViewportPadding(map, viewportPaddingRef.current)
  }, [mapReady])

  useEffect(() => {
    const container = containerRef.current
    const map = mapRef.current
    if (container === null || map === null || !mapReady) {
      return
    }

    const observer = new ResizeObserver(() => {
      map.resize()
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [mapReady])

  useEffect(() => {
    for (const [pointId, marker] of markersRef.current.entries()) {
      const element = marker.getElement()
      element.classList.toggle(
        'journey-map-pin--focused',
        pointId === focusPointId,
      )
    }

    const map = mapRef.current
    if (map === null || focusPointId === null || !map.loaded()) {
      lastFocusedPointIdRef.current = null
      return
    }

    const point = points.find((candidate) => candidate.id === focusPointId)
    if (point === undefined) {
      return
    }

    const displayPoint = displayPoints.find(
      (candidate) => candidate.id === focusPointId,
    )
    const focusChanged = lastFocusedPointIdRef.current !== focusPointId
    if (focusChanged) {
      const center: [number, number] = [
        displayPoint?.displayLongitude ?? point.longitude,
        displayPoint?.displayLatitude ?? point.latitude,
      ]
      if (interactionRef.current.focusZoom !== false) {
        map.flyTo({
          center,
          essential: true,
          zoom: interactionRef.current.focusZoom,
        })
      } else {
        void map.easeTo({
          center,
          duration: prefersReducedMotion() ? 0 : 450,
          essential: true,
          zoom: map.getZoom(),
        })
        if (viewOptionsRef.current.pinVariant === 'reader') {
          void map.once('moveend', () => {
            void map.panBy([0, 52], {
              duration: prefersReducedMotion() ? 0 : 250,
            })
          })
        }
      }
      lastFocusedPointIdRef.current = focusPointId
      showPointPopup(point, map, interactionRef, activePopupRef, markersRef)
    }
  }, [displayPoints, focusPointId, points])

  useEffect(() => {
    return () => {
      activePopupRef.current?.remove()
    }
  }, [])

  return points.length === 0 ? null : (
    <div
      aria-label={t('journey.map')}
      className={className}
      ref={containerRef}
      role="region"
    />
  )
}

function syncPhotoMarkers(
  map: maplibregl.Map,
  displayPoints: DisplayJourneyMapPoint[],
  markersRef: RefObject<Map<string, maplibregl.Marker>>,
  interactionRef: RefObject<MapInteractionContext>,
  activePopupRef: RefObject<maplibregl.Popup | null>,
  onPointClick: (point: JourneyMapPoint) => void,
) {
  const nextIds = new Set(displayPoints.map((point) => point.id))

  for (const [pointId, marker] of markersRef.current.entries()) {
    if (!nextIds.has(pointId)) {
      marker.remove()
      markersRef.current.delete(pointId)
    }
  }

  for (const point of displayPoints) {
    const coordinates: [number, number] = [
      point.displayLongitude,
      point.displayLatitude,
    ]
    const existing = markersRef.current.get(point.id)
    if (existing !== undefined) {
      existing.setLngLat(coordinates)
      refreshJourneyMapPinElement(
        existing.getElement(),
        point,
        interactionRef.current.photoThumbUrls,
      )
      continue
    }

    const element = createJourneyMapPinElement(
      point,
      interactionRef.current.photoThumbUrls,
      { variant: interactionRef.current.pinVariant },
    )
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      const collocated = getCollocatedPoints(
        interactionRef.current.points,
        point,
      )
      if (collocated.length > 1) {
        showCollocatedPointsPopup(
          collocated,
          new maplibregl.LngLat(point.longitude, point.latitude),
          map,
          interactionRef,
          activePopupRef,
          markersRef,
        )
        interactionRef.current.onFocusPointChange?.(point.id)
        return
      }
      onPointClick(point)
    })

    const marker = new maplibregl.Marker({
      anchor: getMarkerAnchor(point, interactionRef.current.pinVariant),
      element,
    })
      .setLngLat(coordinates)
      .addTo(map)
    markersRef.current.set(point.id, marker)
  }
}

interface DisplayJourneyMapPoint extends JourneyMapPoint {
  displayLatitude: number
  displayLongitude: number
}

function layoutCollocatedPoints(
  points: JourneyMapPoint[],
  spread = 1,
): DisplayJourneyMapPoint[] {
  const groups = new Map<string, JourneyMapPoint[]>()

  for (const point of points) {
    const key = `${point.latitude.toFixed(5)}:${point.longitude.toFixed(5)}`
    const group = groups.get(key) ?? []
    group.push(point)
    groups.set(key, group)
  }

  const displayPoints: DisplayJourneyMapPoint[] = []
  for (const group of groups.values()) {
    group.forEach((point, index) => {
      const offset = collocatedOffset(index, group.length, spread)
      displayPoints.push({
        ...point,
        displayLatitude: point.latitude + offset.latitude,
        displayLongitude: point.longitude + offset.longitude,
      })
    })
  }

  return displayPoints
}

function collocatedOffset(index: number, total: number, spread = 1) {
  if (total <= 1) {
    return { latitude: 0, longitude: 0 }
  }

  const angle = (2 * Math.PI * index) / total
  const radius = 0.00018 * Math.min(total, 8) * spread
  return {
    latitude: Math.sin(angle) * radius,
    longitude: Math.cos(angle) * radius,
  }
}

function applyMapViewportPadding(
  map: maplibregl.Map,
  padding: maplibregl.PaddingOptions,
) {
  map.setPadding(padding)
}

const ROUTE_SOURCE_ID = 'journey-route'
const ROUTE_LAYER_ID = 'journey-route-line'

function syncRouteLayer(
  map: maplibregl.Map,
  routeLine: JourneyMapProps['routeLine'],
) {
  if (routeLine === null || routeLine === undefined) {
    removeRouteLayer(map)
    return
  }

  if (routeLine.coordinates.length < 2) {
    removeRouteLayer(map)
    return
  }

  const lineCoordinates = routeLine.coordinates.map((point) => [
    point.longitude,
    point.latitude,
  ])

  const source = map.getSource(ROUTE_SOURCE_ID)
  if (source?.type === 'geojson') {
    ;(source as maplibregl.GeoJSONSource).setData({
      geometry: {
        coordinates: lineCoordinates,
        type: 'LineString',
      },
      properties: {},
      type: 'Feature',
    })
    map.setPaintProperty(
      ROUTE_LAYER_ID,
      'line-dasharray',
      routeLine.source === 'approximate' ? [2, 1.5] : [1, 0],
    )
    return
  }

  map.addSource(ROUTE_SOURCE_ID, {
    data: {
      geometry: {
        coordinates: lineCoordinates,
        type: 'LineString',
      },
      properties: {},
      type: 'Feature',
    },
    type: 'geojson',
  })
  map.addLayer({
    id: ROUTE_LAYER_ID,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-color': '#285943',
      'line-dasharray': routeLine.source === 'approximate' ? [2, 1.5] : [1, 0],
      'line-opacity': 0.72,
      'line-width': 3,
    },
    source: ROUTE_SOURCE_ID,
    type: 'line',
  })
}

function removeRouteLayer(map: maplibregl.Map) {
  if (map.getLayer(ROUTE_LAYER_ID) !== undefined) {
    map.removeLayer(ROUTE_LAYER_ID)
  }
  if (map.getSource(ROUTE_SOURCE_ID) !== undefined) {
    map.removeSource(ROUTE_SOURCE_ID)
  }
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function fitMapViewport(
  map: maplibregl.Map,
  displayPoints: DisplayJourneyMapPoint[],
  boundsCoordinates: MapCoordinate[] | null | undefined,
  options: MapViewOptions,
) {
  const fitPoints =
    boundsCoordinates !== null &&
    boundsCoordinates !== undefined &&
    boundsCoordinates.length > 0
      ? boundsCoordinates
      : displayPoints.map((point) => ({
          latitude: point.displayLatitude,
          longitude: point.displayLongitude,
        }))

  if (fitPoints.length === 0) {
    return
  }

  const numericPadding =
    typeof options.fitPadding === 'number'
      ? options.fitPadding
      : Math.max(
          options.fitPadding.top ?? 0,
          options.fitPadding.right ?? 0,
          options.fitPadding.bottom ?? 0,
          options.fitPadding.left ?? 0,
        )

  const camera = computeJourneyStopMapCamera(fitPoints, {
    boundsPadding: numericPadding,
    maxFitZoomLevel: options.maxFitZoom,
    singleStopZoomLevel: options.singlePointZoom,
  })

  if (camera === null) {
    return
  }

  if (camera.type === 'center') {
    map.setCenter([camera.center.longitude, camera.center.latitude])
    map.setZoom(camera.zoomLevel)
    if (options.pinVariant === 'reader') {
      map.panBy([0, 52], { duration: 0 })
    }
    return
  }

  map.fitBounds(
    [
      [camera.sw[0], camera.sw[1]],
      [camera.ne[0], camera.ne[1]],
    ],
    {
      duration: 0,
      maxZoom: camera.maxZoomLevel,
      padding: options.fitPadding,
    },
  )
}

function showPointPopup(
  point: JourneyMapPoint,
  map: maplibregl.Map,
  interactionRef: RefObject<MapInteractionContext>,
  activePopupRef: RefObject<maplibregl.Popup | null>,
  markersRef: RefObject<Map<string, maplibregl.Marker>>,
) {
  activePopupRef.current?.remove()
  const hiddenPointIds = getCollocatedPointIds(
    interactionRef.current.points,
    point,
  )
  setHiddenMapMarkers(markersRef, hiddenPointIds)
  const popup = createStyledPopup(point, interactionRef.current)
  attachPopupCloseHandler(popup, markersRef, interactionRef, activePopupRef)
  popup.setLngLat([point.longitude, point.latitude]).addTo(map)
  activePopupRef.current = popup
  interactionRef.current.onFocusPointChange?.(point.id)
}

function attachPopupCloseHandler(
  popup: maplibregl.Popup,
  markersRef: RefObject<Map<string, maplibregl.Marker>>,
  interactionRef: RefObject<MapInteractionContext>,
  activePopupRef: RefObject<maplibregl.Popup | null>,
) {
  popup.on('close', () => {
    setHiddenMapMarkers(markersRef, new Set())
    if (activePopupRef.current === popup) {
      activePopupRef.current = null
    }
    interactionRef.current.onFocusPointChange?.(null)
  })
}

function setHiddenMapMarkers(
  markersRef: RefObject<Map<string, maplibregl.Marker>>,
  hiddenPointIds: Set<string>,
) {
  for (const [pointId, marker] of markersRef.current.entries()) {
    marker
      .getElement()
      .classList.toggle('journey-map-pin--hidden', hiddenPointIds.has(pointId))
  }
}

function getCollocatedPointIds(
  points: JourneyMapPoint[],
  point: JourneyMapPoint,
): Set<string> {
  return new Set(
    points
      .filter(
        (candidate) =>
          candidate.latitude === point.latitude &&
          candidate.longitude === point.longitude,
      )
      .map((candidate) => candidate.id),
  )
}

function getMarkerAnchor(
  point: JourneyMapPoint,
  pinVariant: 'default' | 'reader',
): maplibregl.PositionAnchor {
  if (pinVariant === 'reader') {
    return point.type === 'photo' || point.photoId !== null
      ? 'bottom'
      : 'center'
  }

  return 'bottom'
}

function createStyledPopup(
  point: JourneyMapPoint,
  context: MapInteractionContext,
) {
  const content = document.createElement('div')
  content.className = 'journey-map-popup'

  if (point.photoId !== null) {
    const thumbUrl = context.photoThumbUrls[point.photoId]
    if (thumbUrl !== undefined) {
      const image = document.createElement('img')
      image.alt = ''
      image.className = 'journey-map-popup__image'
      image.src = thumbUrl
      content.append(image)
    }
  }

  const title = document.createElement('p')
  title.className = 'journey-map-popup__title'
  title.textContent = getPopupTitle(point, context.t)
  content.append(title)

  if (point.type === 'nature-goal') {
    const status = document.createElement('p')
    status.className = 'journey-map-popup__meta'
    status.textContent = point.checked
      ? context.t('journey.mapNatureVisited')
      : context.t('journey.mapNatureWish')
    content.append(status)

    if (point.notes !== '') {
      const notes = document.createElement('p')
      notes.className = 'journey-map-popup__notes'
      notes.textContent = point.notes
      content.append(notes)
    }

    if (
      context.canEdit &&
      point.checklistItemId !== null &&
      context.onMarkNatureGoalSpotted !== undefined
    ) {
      const checklistItem = context.checklistItems.find(
        (item) => item.id === point.checklistItemId,
      )
      if (checklistItem !== undefined) {
        const action = document.createElement('button')
        action.className = 'journey-map-popup__action'
        action.textContent = point.checked
          ? context.t('nature.strip.markNotSpotted')
          : context.t('nature.strip.markSpotted')
        action.type = 'button'
        action.addEventListener('click', () => {
          context.onMarkNatureGoalSpotted?.(checklistItem)
        })
        content.append(action)
      }
    }
  }

  if (point.entryId !== null && point.type !== 'nature-goal') {
    const action = document.createElement('button')
    action.className = 'journey-map-popup__action'
    action.textContent =
      point.type === 'photo'
        ? context.t('journey.openPhoto')
        : context.t('journey.openMoment')
    action.type = 'button'
    action.addEventListener('click', () => {
      if (point.entryId !== null) {
        context.onOpenEntry?.(point.entryId)
      }
    })
    content.append(action)
  }

  return new maplibregl.Popup({
    className:
      context.pinVariant === 'reader'
        ? 'journey-map-popup-container journey-map-popup-container--reader'
        : 'journey-map-popup-container',
    closeButton: true,
    maxWidth: context.pinVariant === 'reader' ? '200px' : '240px',
    offset: context.popupOffset,
  }).setDOMContent(content)
}

function getPopupTitle(point: JourneyMapPoint, t: TFunction): string {
  if (point.type === 'photo') {
    return t('journey.mapPhotoTitle', { title: point.title })
  }
  if (point.type === 'nature-goal') {
    return t('journey.mapNatureTitle', { title: point.title })
  }
  return point.title
}

function getCollocatedPoints(
  points: JourneyMapPoint[],
  point: JourneyMapPoint,
): JourneyMapPoint[] {
  return points.filter(
    (candidate) =>
      candidate.latitude === point.latitude &&
      candidate.longitude === point.longitude,
  )
}

function showCollocatedPointsPopup(
  points: JourneyMapPoint[],
  lngLat: maplibregl.LngLat,
  map: maplibregl.Map,
  interactionRef: RefObject<MapInteractionContext>,
  activePopupRef: RefObject<maplibregl.Popup | null>,
  markersRef: RefObject<Map<string, maplibregl.Marker>>,
) {
  activePopupRef.current?.remove()
  const context = interactionRef.current
  const hiddenPointIds = new Set(points.map((point) => point.id))
  setHiddenMapMarkers(markersRef, hiddenPointIds)
  const content = document.createElement('div')
  content.className = 'journey-map-popup journey-map-popup--stack'

  const heading = document.createElement('p')
  heading.className = 'journey-map-popup__title'
  heading.textContent = context.t('journey.mapCollocatedTitle', {
    count: points.length,
  })
  content.append(heading)

  const list = document.createElement('div')
  list.className = 'journey-map-popup__stack'
  for (const point of points) {
    list.append(
      createPopupListItem(point, context, () => {
        context.onFocusPointChange?.(point.id)
      }),
    )
  }
  content.append(list)

  const popup = new maplibregl.Popup({
    className:
      context.pinVariant === 'reader'
        ? 'journey-map-popup-container journey-map-popup-container--reader'
        : 'journey-map-popup-container',
    closeButton: true,
    maxWidth: context.pinVariant === 'reader' ? '240px' : '280px',
    offset: context.popupOffset,
  })
    .setLngLat(lngLat)
    .setDOMContent(content)
    .addTo(map)
  attachPopupCloseHandler(popup, markersRef, interactionRef, activePopupRef)
  activePopupRef.current = popup
}

function createPopupListItem(
  point: JourneyMapPoint,
  context: MapInteractionContext,
  onSelect: () => void,
) {
  const item = document.createElement('button')
  item.className = 'journey-map-popup__stack-item'
  item.type = 'button'

  if (point.photoId !== null) {
    const thumbUrl = context.photoThumbUrls[point.photoId]
    if (thumbUrl !== undefined) {
      const image = document.createElement('img')
      image.alt = ''
      image.className = 'journey-map-popup__stack-thumb'
      image.src = thumbUrl
      item.append(image)
    }
  }

  const label = document.createElement('span')
  label.className = 'journey-map-popup__stack-label'
  label.textContent = getPopupTitle(point, context.t)
  item.append(label)

  item.addEventListener('click', () => {
    onSelect()
    if (point.entryId !== null && point.type !== 'nature-goal') {
      context.onOpenEntry?.(point.entryId)
    }
  })

  return item
}
