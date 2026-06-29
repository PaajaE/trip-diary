import type { TFunction } from 'i18next'
import type { RefObject } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTranslation } from 'react-i18next'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import type { JourneyPhotoLocation } from '@/entities/photo/api/photo-location.repository'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import {
  getJourneyMapPoints,
  type JourneyMapPoint,
} from '@/features/journeys/ui/journey-map-points'
import { getAppMapStyle } from '@/shared/lib/map-style'

interface JourneyMapProps {
  className?: string
  focusPointId?: string | null
  moments: JourneyMoment[]
  onFocusPointChange?: (pointId: string | null) => void
  onOpenEntry?: (entryId: string) => void
  photoLocations: JourneyPhotoLocation[]
  photoThumbUrls?: Record<string, string>
  plannedStops: JourneyDetail['stops']
}

const POINT_COLORS: Record<JourneyMapPoint['type'], string> = {
  moment: '#285943',
  photo: '#1d6fa5',
  planned: '#bf6b3d',
}

const CLICK_RADIUS_PX = 22

interface MapInteractionContext {
  onFocusPointChange?: ((pointId: string | null) => void) | undefined
  onOpenEntry?: ((entryId: string) => void) | undefined
  photoThumbUrls: Record<string, string>
  points: JourneyMapPoint[]
  t: TFunction
}

export function JourneyMap({
  className = 'mt-8 h-80 overflow-hidden rounded-lg border border-border sm:h-96',
  focusPointId = null,
  moments,
  onFocusPointChange,
  onOpenEntry,
  photoLocations,
  photoThumbUrls = {},
  plannedStops,
}: JourneyMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const highlightMarkerRef = useRef<maplibregl.Marker | null>(null)
  const activePopupRef = useRef<maplibregl.Popup | null>(null)
  const layersReadyRef = useRef(false)
  const hasAutoFitRef = useRef(false)
  const lastFocusedPointIdRef = useRef<string | null>(null)
  const interactionRef = useRef<MapInteractionContext>({
    photoThumbUrls,
    points: [],
    t,
  })
  const points = useMemo(
    () => getJourneyMapPoints(moments, plannedStops, photoLocations),
    [moments, photoLocations, plannedStops],
  )
  const geoJson = useMemo(() => pointsToFeatureCollection(points), [points])

  interactionRef.current = {
    onFocusPointChange,
    onOpenEntry,
    photoThumbUrls,
    points,
    t,
  }

  useEffect(() => {
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
      ensureJourneyMapLayers(map, interactionRef, activePopupRef)
      layersReadyRef.current = true
      const first = interactionRef.current.points[0]
      if (first !== undefined && focusPointId === null) {
        fitMapToPoints(map, interactionRef.current.points)
        hasAutoFitRef.current = true
      }
    }

    if (map.loaded()) {
      onLoad()
    } else {
      map.once('load', onLoad)
    }

    return () => {
      activePopupRef.current?.remove()
      activePopupRef.current = null
      highlightMarkerRef.current?.remove()
      highlightMarkerRef.current = null
      map.remove()
      mapRef.current = null
      layersReadyRef.current = false
      hasAutoFitRef.current = false
      lastFocusedPointIdRef.current = null
    }
  }, [i18n.language])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || !layersReadyRef.current || !map.loaded()) {
      return
    }

    const source = map.getSource('journey-points') as
      | maplibregl.GeoJSONSource
      | undefined
    source?.setData(geoJson)

    if (
      focusPointId === null &&
      !hasAutoFitRef.current &&
      points.length > 0
    ) {
      fitMapToPoints(map, points)
      hasAutoFitRef.current = true
    }
  }, [focusPointId, geoJson, points])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || focusPointId === null || !map.loaded()) {
      highlightMarkerRef.current?.remove()
      highlightMarkerRef.current = null
      lastFocusedPointIdRef.current = null
      return
    }

    const point = points.find((candidate) => candidate.id === focusPointId)
    if (point === undefined) {
      return
    }

    const coordinates: [number, number] = [point.longitude, point.latitude]
    const focusChanged = lastFocusedPointIdRef.current !== focusPointId
    if (focusChanged) {
      map.flyTo({
        center: coordinates,
        essential: true,
        zoom: 14,
      })
      lastFocusedPointIdRef.current = focusPointId
    }

    highlightMarkerRef.current?.remove()
    highlightMarkerRef.current = new maplibregl.Marker({
      color: POINT_COLORS[point.type],
    })
      .setLngLat(coordinates)
      .setPopup(
        createStyledPopup(
          point,
          interactionRef.current.t,
          interactionRef.current.photoThumbUrls,
          interactionRef.current.onOpenEntry,
        ),
      )
      .addTo(map)
    if (focusChanged) {
      highlightMarkerRef.current.togglePopup()
    }
  }, [focusPointId, points, t])

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

function ensureJourneyMapLayers(
  map: maplibregl.Map,
  interactionRef: RefObject<MapInteractionContext>,
  activePopupRef: RefObject<maplibregl.Popup | null>,
) {
  const initialPoints = interactionRef.current.points
  const geoJson = pointsToFeatureCollection(initialPoints)

  map.addSource('journey-points', {
    cluster: true,
    clusterMaxZoom: 14,
    clusterRadius: 48,
    data: geoJson,
    type: 'geojson',
  })

  map.addLayer({
    filter: ['has', 'point_count'],
    id: 'journey-clusters',
    paint: {
      'circle-color': '#285943',
      'circle-radius': ['step', ['get', 'point_count'], 18, 5, 24, 12, 30],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
    source: 'journey-points',
    type: 'circle',
  })

  map.addLayer({
    filter: ['has', 'point_count'],
    id: 'journey-cluster-count',
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
    },
    paint: {
      'text-color': '#ffffff',
    },
    source: 'journey-points',
    type: 'symbol',
  })

  map.addLayer({
    filter: ['!', ['has', 'point_count']],
    id: 'journey-points-unclustered',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': 10,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
    source: 'journey-points',
    type: 'circle',
  })

  map.addLayer({
    filter: ['!', ['has', 'point_count']],
    id: 'journey-points-hit',
    paint: {
      'circle-color': '#000000',
      'circle-opacity': 0,
      'circle-radius': 24,
    },
    source: 'journey-points',
    type: 'circle',
  })

  function showPointsAtClick(event: maplibregl.MapMouseEvent) {
    const clickedPoints = getPointsAtClick(map, event, interactionRef.current.points)
    if (clickedPoints.length === 0) {
      return
    }
    if (clickedPoints.length === 1) {
      const [point] = clickedPoints
      if (point !== undefined) {
        showPointPopup(point, event.lngLat)
      }
      return
    }
    showCollocatedPointsPopup(
      clickedPoints,
      event.lngLat,
      map,
      interactionRef.current.t,
      interactionRef.current.photoThumbUrls,
      interactionRef.current.onOpenEntry,
      (popup) => {
        activePopupRef.current?.remove()
        activePopupRef.current = popup
      },
      interactionRef.current.onFocusPointChange,
    )
  }

  function showPointPopup(point: JourneyMapPoint, lngLat: maplibregl.LngLat) {
    const popup = createStyledPopup(
      point,
      interactionRef.current.t,
      interactionRef.current.photoThumbUrls,
      interactionRef.current.onOpenEntry,
    )
    popup.setLngLat(lngLat).addTo(map)
    activePopupRef.current?.remove()
    activePopupRef.current = popup
    interactionRef.current.onFocusPointChange?.(point.id)
  }

  map.on('click', ['journey-clusters', 'journey-cluster-count'], (event) => {
    const feature = event.features?.[0]
    const clusterId = feature?.properties?.cluster_id
    const mapSource = map.getSource('journey-points') as maplibregl.GeoJSONSource
    if (clusterId === undefined) {
      return
    }

    void mapSource.getClusterLeaves(clusterId, 100, 0).then((leaves) => {
      const pointIds = new Set<string>()
      for (const leaf of leaves) {
        const id = leaf.properties?.id
        if (typeof id === 'string') {
          pointIds.add(id)
        }
      }
      const clusterPoints = interactionRef.current.points.filter((point) =>
        pointIds.has(point.id),
      )
      if (clusterPoints.length > 1 && areCollocated(clusterPoints)) {
        showCollocatedPointsPopup(
          clusterPoints,
          event.lngLat,
          map,
          interactionRef.current.t,
          interactionRef.current.photoThumbUrls,
          interactionRef.current.onOpenEntry,
          (popup) => {
            activePopupRef.current?.remove()
            activePopupRef.current = popup
          },
          interactionRef.current.onFocusPointChange,
        )
        return
      }

      void mapSource.getClusterExpansionZoom(clusterId).then((zoom) => {
        const coordinates = (feature?.geometry as Point | undefined)?.coordinates
        const longitude = coordinates?.[0]
        const latitude = coordinates?.[1]
        if (longitude === undefined || latitude === undefined) {
          return
        }
        map.easeTo({
          center: [longitude, latitude],
          zoom,
        })
      })
    })
  })

  map.on('click', 'journey-points-hit', (event) => {
    showPointsAtClick(event)
  })

  for (const layerId of [
    'journey-clusters',
    'journey-cluster-count',
    'journey-points-hit',
    'journey-points-unclustered',
  ]) {
    map.on('mouseenter', layerId, () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', layerId, () => {
      map.getCanvas().style.cursor = ''
    })
  }
}

function fitMapToPoints(map: maplibregl.Map, points: JourneyMapPoint[]) {
  if (points.length === 0) {
    return
  }

  if (points.length === 1) {
    const [point] = points
    if (point === undefined) {
      return
    }
    map.setCenter([point.longitude, point.latitude])
    map.setZoom(10)
    return
  }

  const bounds = new maplibregl.LngLatBounds()
  for (const point of points) {
    bounds.extend([point.longitude, point.latitude])
  }
  map.fitBounds(bounds, { duration: 0, maxZoom: 11, padding: 56 })
}

function pointsToFeatureCollection(
  points: JourneyMapPoint[],
): FeatureCollection<Point> {
  return {
    features: points.map((point) => ({
      geometry: {
        coordinates: [point.longitude, point.latitude],
        type: 'Point',
      },
      properties: {
        color: POINT_COLORS[point.type],
        entryId: point.entryId,
        id: point.id,
        photoId: point.photoId,
        title: point.title,
        type: point.type,
      },
      type: 'Feature',
    })),
    type: 'FeatureCollection',
  }
}

function createStyledPopup(
  point: JourneyMapPoint,
  t: TFunction,
  photoThumbUrls: Record<string, string>,
  onOpenEntry?: (entryId: string) => void,
) {
  const content = document.createElement('div')
  content.className = 'journey-map-popup'

  if (point.type === 'photo' && point.photoId !== null) {
    const thumbUrl = photoThumbUrls[point.photoId]
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
  title.textContent =
    point.type === 'photo'
      ? t('journey.mapPhotoTitle', { title: point.title })
      : point.title
  content.append(title)

  if (point.entryId !== null) {
    const action = document.createElement('button')
    action.className = 'journey-map-popup__action'
    action.textContent =
      point.type === 'photo' ? t('journey.openPhoto') : t('journey.openMoment')
    action.type = 'button'
    action.addEventListener('click', () => {
      onOpenEntry?.(point.entryId!)
    })
    content.append(action)
  }

  return new maplibregl.Popup({
    className: 'journey-map-popup-container',
    closeButton: true,
    maxWidth: '240px',
    offset: 16,
  }).setDOMContent(content)
}

function getPointsAtClick(
  map: maplibregl.Map,
  event: maplibregl.MapMouseEvent,
  points: JourneyMapPoint[],
): JourneyMapPoint[] {
  const bbox: [maplibregl.PointLike, maplibregl.PointLike] = [
    [event.point.x - CLICK_RADIUS_PX, event.point.y - CLICK_RADIUS_PX],
    [event.point.x + CLICK_RADIUS_PX, event.point.y + CLICK_RADIUS_PX],
  ]
  const features = map.queryRenderedFeatures(bbox, {
    layers: ['journey-points-hit'],
  })
  const ids = new Set<string>()
  for (const feature of features) {
    const id = feature.properties?.id
    if (typeof id === 'string') {
      ids.add(id)
    }
  }
  return points.filter((point) => ids.has(point.id))
}

function areCollocated(points: JourneyMapPoint[]): boolean {
  if (points.length <= 1) {
    return true
  }
  const [first] = points
  if (first === undefined) {
    return true
  }
  return points.every(
    (point) =>
      point.latitude === first.latitude && point.longitude === first.longitude,
  )
}

function showCollocatedPointsPopup(
  points: JourneyMapPoint[],
  lngLat: maplibregl.LngLat,
  map: maplibregl.Map,
  t: TFunction,
  photoThumbUrls: Record<string, string>,
  onOpenEntry: ((entryId: string) => void) | undefined,
  setActivePopup: (popup: maplibregl.Popup) => void,
  onFocusPointChange?: ((pointId: string | null) => void) | undefined,
) {
  const content = document.createElement('div')
  content.className = 'journey-map-popup journey-map-popup--stack'

  const heading = document.createElement('p')
  heading.className = 'journey-map-popup__title'
  heading.textContent = t('journey.mapCollocatedTitle', { count: points.length })
  content.append(heading)

  const list = document.createElement('div')
  list.className = 'journey-map-popup__stack'
  for (const point of points) {
    list.append(
      createPopupListItem(point, t, photoThumbUrls, onOpenEntry, () => {
        onFocusPointChange?.(point.id)
      }),
    )
  }
  content.append(list)

  const popup = new maplibregl.Popup({
    className: 'journey-map-popup-container',
    closeButton: true,
    maxWidth: '280px',
    offset: 16,
  })
    .setLngLat(lngLat)
    .setDOMContent(content)
    .addTo(map)
  setActivePopup(popup)
}

function createPopupListItem(
  point: JourneyMapPoint,
  t: TFunction,
  photoThumbUrls: Record<string, string>,
  onOpenEntry: ((entryId: string) => void) | undefined,
  onSelect: () => void,
) {
  const item = document.createElement('button')
  item.className = 'journey-map-popup__stack-item'
  item.type = 'button'

  if (point.type === 'photo' && point.photoId !== null) {
    const thumbUrl = photoThumbUrls[point.photoId]
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
  label.textContent =
    point.type === 'photo'
      ? t('journey.mapPhotoTitle', { title: point.title })
      : point.title
  item.append(label)

  item.addEventListener('click', () => {
    onSelect()
    if (point.entryId !== null) {
      onOpenEntry?.(point.entryId)
    }
  })

  return item
}
