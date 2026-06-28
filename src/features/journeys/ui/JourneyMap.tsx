import type { TFunction } from 'i18next'
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
  focusPointId?: string | null
  moments: JourneyMoment[]
  photoLocations: JourneyPhotoLocation[]
  plannedStops: JourneyDetail['stops']
}

const POINT_COLORS: Record<JourneyMapPoint['type'], string> = {
  moment: '#285943',
  photo: '#1d6fa5',
  planned: '#bf6b3d',
}

export function JourneyMap({
  focusPointId = null,
  moments,
  photoLocations,
  plannedStops,
}: JourneyMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const highlightMarkerRef = useRef<maplibregl.Marker | null>(null)
  const layersReadyRef = useRef(false)
  const points = useMemo(
    () => getJourneyMapPoints(moments, plannedStops, photoLocations),
    [moments, photoLocations, plannedStops],
  )
  const geoJson = useMemo(() => pointsToFeatureCollection(points), [points])

  useEffect(() => {
    const container = containerRef.current
    const first = points[0]
    if (container === null || first === undefined) {
      return
    }

    let map = mapRef.current
    if (map === null) {
      map = new maplibregl.Map({
        attributionControl: false,
        center: [first.longitude, first.latitude],
        container,
        style: getAppMapStyle(i18n.language),
        zoom: 5,
      })
      map.addControl(new maplibregl.AttributionControl({ compact: true }))
      map.addControl(new maplibregl.NavigationControl(), 'top-right')
      mapRef.current = map
    }

    const renderMap = () => {
      if (map === null) {
        return
      }

      if (!layersReadyRef.current) {
        ensureJourneyMapLayers(map, points, t)
        layersReadyRef.current = true
      } else {
        const source = map.getSource('journey-points') as
          | maplibregl.GeoJSONSource
          | undefined
        source?.setData(geoJson)
      }

      if (focusPointId === null) {
        fitMapToPoints(map, points)
      }
    }

    if (map.loaded()) {
      renderMap()
    } else {
      map.once('load', renderMap)
    }
  }, [focusPointId, geoJson, i18n.language, points, t])

  useEffect(() => {
    const map = mapRef.current
    if (map === null || focusPointId === null || !map.loaded()) {
      highlightMarkerRef.current?.remove()
      highlightMarkerRef.current = null
      return
    }

    const point = points.find((candidate) => candidate.id === focusPointId)
    if (point === undefined) {
      return
    }

    const coordinates: [number, number] = [point.longitude, point.latitude]
    map.flyTo({
      center: coordinates,
      essential: true,
      zoom: 14,
    })

    highlightMarkerRef.current?.remove()
    highlightMarkerRef.current = new maplibregl.Marker({
      color: POINT_COLORS[point.type],
    })
      .setLngLat(coordinates)
      .setPopup(
        new maplibregl.Popup().setDOMContent(createPointPopup(point, t)),
      )
      .addTo(map)
    highlightMarkerRef.current.togglePopup()
  }, [focusPointId, points, t])

  useEffect(() => {
    return () => {
      highlightMarkerRef.current?.remove()
      highlightMarkerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
      layersReadyRef.current = false
    }
  }, [])

  return points.length === 0 ? null : (
    <div
      aria-label={t('journey.map')}
      className="mt-8 h-80 overflow-hidden rounded-lg border border-border sm:h-96"
      ref={containerRef}
      role="region"
    />
  )
}

function ensureJourneyMapLayers(
  map: maplibregl.Map,
  points: JourneyMapPoint[],
  t: TFunction,
) {
  const geoJson = pointsToFeatureCollection(points)

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
      'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
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
      'circle-radius': 8,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
    source: 'journey-points',
    type: 'circle',
  })

  map.on('click', 'journey-clusters', (event) => {
    const feature = event.features?.[0]
    const clusterId = feature?.properties?.cluster_id
    const mapSource = map.getSource('journey-points') as maplibregl.GeoJSONSource
    if (clusterId === undefined) {
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

  map.on('click', 'journey-points-unclustered', (event) => {
    const feature = event.features?.[0]
    if (feature === undefined) {
      return
    }
    const point = points.find(
      (candidate) => candidate.id === feature.properties?.id,
    )
    if (point === undefined) {
      return
    }

    new maplibregl.Popup()
      .setLngLat(event.lngLat)
      .setDOMContent(createPointPopup(point, t))
      .addTo(map)
  })

  for (const layerId of ['journey-clusters', 'journey-points-unclustered']) {
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

function createPointPopup(point: JourneyMapPoint, t: TFunction) {
  const content = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent =
    point.type === 'photo'
      ? t('journey.mapPhotoTitle', { title: point.title })
      : point.title
  content.append(title)

  if (point.entryId !== null) {
    const link = document.createElement('a')
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
    link.href = `${basePath}/e/${encodeURIComponent(point.entryId)}`
    link.textContent =
      point.type === 'photo' ? t('journey.openPhoto') : t('journey.openMoment')
    link.style.display = 'block'
    link.style.marginTop = '0.35rem'
    content.append(link)
  }

  return content
}
