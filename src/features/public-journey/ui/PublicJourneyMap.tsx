import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getAppMapStyle } from '@/shared/lib/map-style'

export interface PublicMapPoint {
  color: string
  id: string
  label: string
  latitude: number
  longitude: number
  thumbUrl: string | null
}

export interface PublicMapLine {
  color: string
  coordinates: number[][]
  dashed?: boolean
  id: string
}

export interface PublicJourneyMapProps {
  label: string
  lines: PublicMapLine[]
  onSelectPoint?: (id: string) => void
  points: PublicMapPoint[]
}

interface PublicJourneyMapInnerProps extends PublicJourneyMapProps {
  /** Replaces the default box classes (the section draws the box itself). */
  className?: string
  /** Called once the first complete render (style and tiles) has happened. */
  onReady?: () => void
}

const SOURCE = 'public-points'

interface SourceFeature {
  geometry: { coordinates: number[]; type: string }
  properties: { cluster_id?: number; id?: string; point_count?: number }
}

function pinElement(point: PublicMapPoint): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.ariaLabel = point.label
  el.style.cssText = `width:36px;height:36px;border-radius:9999px;border:3px solid ${point.color};background:#fff center/cover no-repeat;box-shadow:0 1px 5px rgba(0,0,0,.45);cursor:pointer;padding:0`
  if (point.thumbUrl !== null) {
    el.style.backgroundImage = `url("${point.thumbUrl}")`
  } else {
    el.style.background = point.color
  }
  return el
}

function clusterElement(count: number): HTMLDivElement {
  const el = document.createElement('div')
  el.textContent = String(count)
  el.style.cssText =
    'width:40px;height:40px;border-radius:9999px;background:#285943;color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font:600 14px system-ui;box-shadow:0 1px 5px rgba(0,0,0,.45);cursor:pointer'
  return el
}

/** Route lines coloured per stage, photo pins with HTML-marker clustering. */
export default function PublicJourneyMap({
  label,
  lines,
  onReady,
  onSelectPoint,
  points,
  className = 'h-[22rem] w-full overflow-hidden rounded-lg border border-border bg-surface sm:h-[28rem]',
}: PublicJourneyMapInnerProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelectPoint)
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onSelectRef.current = onSelectPoint
    onReadyRef.current = onReady
  })

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const map = new maplibregl.Map({
      attributionControl: false,
      // Wheel zoom needs Ctrl so the page stays scrollable.
      cooperativeGestures: true,
      center: [0, 20],
      container,
      // MapLibre ships English strings only; localize the visible hints.
      locale: {
        'CooperativeGesturesHandler.MacHelpText': t(
          'publicJourney.mapGesturesMac',
        ),
        'CooperativeGesturesHandler.MobileHelpText': t(
          'publicJourney.mapGesturesMobile',
        ),
        'CooperativeGesturesHandler.WindowsHelpText': t(
          'publicJourney.mapGesturesDesktop',
        ),
        'NavigationControl.ResetBearing': t('publicJourney.mapResetBearing'),
        'NavigationControl.ZoomIn': t('publicJourney.mapZoomIn'),
        'NavigationControl.ZoomOut': t('publicJourney.mapZoomOut'),
      },
      style: getAppMapStyle(i18n.language),
      zoom: 1,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const bounds = new maplibregl.LngLatBounds()
    for (const p of points) bounds.extend([p.longitude, p.latitude])
    for (const line of lines) {
      for (const c of line.coordinates) {
        const [lng, lat] = c
        if (lng !== undefined && lat !== undefined) bounds.extend([lng, lat])
      }
    }
    const fit = () => {
      if (bounds.isEmpty()) return
      map.fitBounds(bounds, { animate: false, maxZoom: 13, padding: 48 })
    }

    const byId = new Map(points.map((p) => [p.id, p]))
    const markers = new Map<string, maplibregl.Marker>()
    let onScreen = new Set<string>()

    const updateMarkers = () => {
      if (map.getSource(SOURCE) === undefined) return
      const features = map.querySourceFeatures(
        SOURCE,
      ) as unknown as SourceFeature[]
      const next = new Map<string, SourceFeature>()
      for (const f of features) {
        if (f.geometry.type !== 'Point') continue
        const props = f.properties
        const key =
          props.cluster_id !== undefined
            ? `c${String(props.cluster_id)}`
            : (props.id ?? '')
        if (key !== '') next.set(key, f)
      }
      for (const [key, feature] of next) {
        if (markers.has(key)) continue
        const props = feature.properties
        if (feature.geometry.type !== 'Point') continue
        const [lng, lat] = feature.geometry.coordinates
        if (lng === undefined || lat === undefined) continue
        const coords: [number, number] = [lng, lat]
        let el: HTMLElement
        if (props.cluster_id !== undefined) {
          el = clusterElement(props.point_count ?? 0)
          const clusterId = props.cluster_id
          el.addEventListener('click', () => {
            const source = map.getSource<maplibregl.GeoJSONSource>(SOURCE)
            if (source === undefined) return
            void source.getClusterExpansionZoom(clusterId).then((zoom) => {
              map.easeTo({ center: coords, zoom })
            })
          })
        } else {
          const point = byId.get(props.id ?? '')
          if (point === undefined) continue
          el = pinElement(point)
          el.addEventListener('click', () => {
            onSelectRef.current?.(point.id)
          })
        }
        markers.set(
          key,
          new maplibregl.Marker({ element: el }).setLngLat(coords).addTo(map),
        )
      }
      for (const key of onScreen) {
        if (!next.has(key)) {
          markers.get(key)?.remove()
          markers.delete(key)
        }
      }
      onScreen = new Set(next.keys())
    }

    map.on('load', () => {
      for (const line of lines) {
        map.addSource(`line-${line.id}`, {
          data: {
            geometry: { coordinates: line.coordinates, type: 'LineString' },
            properties: {},
            type: 'Feature',
          },
          type: 'geojson',
        })
        map.addLayer({
          id: `line-${line.id}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': line.color,
            'line-width': 4,
            ...(line.dashed === true ? { 'line-dasharray': [2, 2] } : {}),
          },
          source: `line-${line.id}`,
          type: 'line',
        })
      }
      map.addSource(SOURCE, {
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
        data: {
          features: points.map((p) => ({
            geometry: {
              coordinates: [p.longitude, p.latitude],
              type: 'Point' as const,
            },
            properties: { id: p.id },
            type: 'Feature' as const,
          })),
          type: 'FeatureCollection',
        },
        type: 'geojson',
      })
      // Invisible layer: markers are HTML, the layer lets the source tile in.
      map.addLayer({
        id: SOURCE,
        paint: { 'circle-opacity': 0, 'circle-radius': 1 },
        source: SOURCE,
        type: 'circle',
      })
      map.on('render', () => {
        if (map.isSourceLoaded(SOURCE)) updateMarkers()
      })
      // First complete render: the section fades the map in over its preview.
      onReadyRef.current?.()
    })

    fit()
    const observer = new ResizeObserver(() => {
      map.resize()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      markers.forEach((marker) => {
        marker.remove()
      })
      map.remove()
    }
  }, [i18n.language, lines, points, t])

  return (
    <div
      aria-label={label}
      className={className}
      ref={containerRef}
      role="region"
    />
  )
}
