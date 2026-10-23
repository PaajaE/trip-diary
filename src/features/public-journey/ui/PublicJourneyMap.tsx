import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getAppMapStyle } from '@/shared/lib/map-style'

export interface PublicMapPoint {
  color: string
  /** Local calendar day (YYYY-MM-DD) in the stage's zone. */
  dayKey: string
  id: string
  label: string
  latitude: number
  longitude: number
  stageId: string
  /** Index of the stage in the journey (-1 when unknown); colours clusters. */
  stageIndex: number
  thumbUrl: string | null
}

export interface PublicMapLine {
  color: string
  coordinates: number[][]
  dashed?: boolean
  id: string
  stageId: string
}

/** What is emphasised on the map; everything else is dimmed. */
export interface MapHighlight {
  dayKey: string | null
  stageId: string | null
}

/** Pin or route under the pointer (null when it leaves). */
export type MapHover = { dayKey: string | null; stageId: string } | null

export interface PublicJourneyMapProps {
  /** Emphasised stage or day (legend hover, day hover); null = nothing. */
  highlight?: MapHighlight | null
  label: string
  lines: PublicMapLine[]
  /** Pointer or keyboard focus on a pin or a route line. */
  onHover?: (hover: MapHover) => void
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
  properties: {
    cluster_id?: number
    id?: string
    max_stage?: number
    min_stage?: number
    point_count?: number
  }
}

function pinElement(point: PublicMapPoint): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.dataset.stage = point.stageId
  el.dataset.day = point.dayKey
  el.ariaLabel = point.label
  el.style.cssText = `width:36px;height:36px;border-radius:9999px;border:3px solid ${point.color};background:#fff center/cover no-repeat;box-shadow:0 1px 5px rgba(0,0,0,.45);cursor:pointer;padding:0`
  if (point.thumbUrl !== null) {
    el.style.backgroundImage = `url("${point.thumbUrl}")`
  } else {
    el.style.background = point.color
  }
  return el
}

const CLUSTER_COLOR = '#285943'

/** Cluster bubble; stage coloured when all its pins belong to one stage. */
function clusterElement(
  count: number,
  color: string,
  stageId: string,
): HTMLDivElement {
  const el = document.createElement('div')
  el.textContent = String(count)
  el.dataset.stage = stageId
  el.dataset.day = ''
  el.style.cssText = `width:40px;height:40px;border-radius:9999px;background:${color};color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font:600 14px system-ui;box-shadow:0 1px 5px rgba(0,0,0,.45);cursor:pointer`
  return el
}

/** Dims pins and clusters that are not part of the highlight. */
function styleMarker(el: HTMLElement, highlight: MapHighlight | null) {
  const stage = el.dataset.stage ?? ''
  const day = el.dataset.day ?? ''
  let dim = false
  if (highlight !== null) {
    if (highlight.dayKey !== null) dim = day !== '' && day !== highlight.dayKey
    else if (highlight.stageId !== null)
      dim = stage !== '' && stage !== highlight.stageId
  }
  el.style.opacity = dim ? '0.3' : '1'
  el.style.zIndex = !dim && highlight !== null ? '2' : ''
}

/** Route lines coloured per stage, photo pins with HTML-marker clustering. */
export default function PublicJourneyMap({
  highlight = null,
  label,
  lines,
  onHover,
  onReady,
  onSelectPoint,
  points,
  className = 'h-[22rem] w-full overflow-hidden rounded-lg border border-border bg-surface sm:h-[28rem]',
}: PublicJourneyMapInnerProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelectPoint)
  const onReadyRef = useRef(onReady)
  const onHoverRef = useRef(onHover)
  const highlightRef = useRef(highlight)
  /** Re-applies `highlightRef` to the live map; set by the map effect. */
  const applyHighlightRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    onSelectRef.current = onSelectPoint
    onReadyRef.current = onReady
    onHoverRef.current = onHover
    highlightRef.current = highlight
  })
  useEffect(() => {
    applyHighlightRef.current?.()
  }, [highlight])

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
    const stageById = new Map(points.map((p) => [p.stageIndex, p]))
    const lineByLayer = new Map(lines.map((l) => [`line-${l.id}`, l]))
    const hoverTarget = (el: HTMLElement, point: PublicMapPoint) => {
      const enter = () => {
        onHoverRef.current?.({ dayKey: point.dayKey, stageId: point.stageId })
      }
      const leave = () => {
        onHoverRef.current?.(null)
      }
      el.addEventListener('mouseenter', enter)
      el.addEventListener('mouseleave', leave)
      el.addEventListener('focus', enter)
      el.addEventListener('blur', leave)
    }
    let styleReady = false
    const applyHighlight = () => {
      const h = highlightRef.current
      for (const marker of markers.values()) {
        styleMarker(marker.getElement(), h)
      }
      if (!styleReady) return
      for (const line of lines) {
        const id = `line-${line.id}`
        if (map.getLayer(id) === undefined) continue
        const dim = h?.stageId != null && h.stageId !== line.stageId
        const lit = h?.stageId != null && h.stageId === line.stageId
        map.setPaintProperty(id, 'line-opacity', dim ? 0.25 : 1)
        map.setPaintProperty(id, 'line-width', lit ? 6 : 4)
      }
    }
    applyHighlightRef.current = applyHighlight
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
          const lo = props.min_stage
          const hi = props.max_stage
          const single =
            lo !== undefined && lo === hi ? stageById.get(lo) : undefined
          el = clusterElement(
            props.point_count ?? 0,
            single?.color ?? CLUSTER_COLOR,
            single?.stageId ?? '',
          )
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
          hoverTarget(el, point)
          el.addEventListener('click', () => {
            onSelectRef.current?.(point.id)
          })
        }
        styleMarker(el, highlightRef.current)
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
      styleReady = true
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
        clusterProperties: {
          max_stage: ['max', ['get', 'stageIndex']],
          min_stage: ['min', ['get', 'stageIndex']],
        },
        clusterRadius: 50,
        data: {
          features: points.map((p) => ({
            geometry: {
              coordinates: [p.longitude, p.latitude],
              type: 'Point' as const,
            },
            properties: { id: p.id, stageIndex: p.stageIndex },
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
      applyHighlight()
      // Hovering a route line reports its stage (pins report themselves).
      const lineLayers = [...lineByLayer.keys()]
      if (lineLayers.length > 0) {
        let hovered: string | null = null
        map.on('mousemove', (event) => {
          const { x, y } = event.point
          const hit = map.queryRenderedFeatures(
            [
              [x - 6, y - 6],
              [x + 6, y + 6],
            ],
            { layers: lineLayers },
          )[0]
          const line =
            hit === undefined ? undefined : lineByLayer.get(hit.layer.id)
          const stageId = line?.stageId ?? null
          map.getCanvas().style.cursor = stageId === null ? '' : 'pointer'
          if (stageId === hovered) return
          hovered = stageId
          onHoverRef.current?.(
            stageId === null || stageId === ''
              ? null
              : { dayKey: null, stageId },
          )
        })
      }
      // First complete render: the section fades the map in over its preview.
      onReadyRef.current?.()
    })

    fit()
    const observer = new ResizeObserver(() => {
      map.resize()
    })
    observer.observe(container)

    return () => {
      applyHighlightRef.current = null
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
