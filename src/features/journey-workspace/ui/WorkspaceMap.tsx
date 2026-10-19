import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Maximize } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildRoutes,
  MAX_FIT_ZOOM,
  type HoverStore,
  type MapPin,
  type MapView,
  type RouteLine,
} from '@/features/journey-workspace/model/workspace-map'
import { getAppMapStyle } from '@/shared/lib/map-style'

/** What the map should show; a new `nonce` re-applies the same view. */
export interface MapViewRequest {
  nonce: number
  view: MapView | null
}

interface WorkspaceMapProps {
  hover: HoverStore
  onReset: () => void
  /** Pin clicked. */
  onSelect: (momentId: string) => void
  pins: MapPin[]
  request: MapViewRequest
  selectedId: string | null
}

const ROUTE_SOURCE = 'workspace-route'
const FIT_PADDING = 48

function applyView(
  map: maplibregl.Map,
  view: MapView | null,
  animate: boolean,
): void {
  if (view === null) return
  if (view.type === 'bounds') {
    map.fitBounds(view.bounds, {
      animate,
      maxZoom: MAX_FIT_ZOOM,
      padding: FIT_PADDING,
    })
  } else if (animate) {
    map.flyTo({
      center: view.center,
      zoom: Math.max(map.getZoom(), view.minZoom),
    })
  } else {
    map.jumpTo({
      center: view.center,
      zoom: Math.max(map.getZoom(), view.minZoom),
    })
  }
}

function syncRoute(map: maplibregl.Map, routes: RouteLine[]): void {
  const data = {
    features: routes.map((line) => ({
      geometry: { coordinates: line.coordinates, type: 'LineString' as const },
      properties: { color: line.color },
      type: 'Feature' as const,
    })),
    type: 'FeatureCollection' as const,
  }
  const source = map.getSource<maplibregl.GeoJSONSource>(ROUTE_SOURCE)
  if (source !== undefined) {
    source.setData(data)
    return
  }
  map.addSource(ROUTE_SOURCE, { data, type: 'geojson' })
  map.addLayer({
    id: ROUTE_SOURCE,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-opacity': 0.75,
      'line-width': 2,
    },
    source: ROUTE_SOURCE,
    type: 'line',
  })
}

function styleMarker(el: HTMLElement, active: boolean, hovered: boolean) {
  el.style.transform = active || hovered ? 'scale(1.4)' : ''
  el.style.zIndex = active || hovered ? '2' : ''
  el.style.boxShadow = active
    ? '0 0 0 3px #fff, 0 0 0 5px #111, 0 1px 4px rgba(0,0,0,.4)'
    : hovered
      ? '0 0 0 3px #fff, 0 1px 4px rgba(0,0,0,.5)'
      : '0 1px 4px rgba(0,0,0,.4)'
}

interface PinMarker {
  el: HTMLButtonElement
  marker: maplibregl.Marker
}

export function WorkspaceMap({
  hover,
  onReset,
  onSelect,
  pins,
  request,
  selectedId,
}: WorkspaceMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const markersRef = useRef(new Map<string, PinMarker>())
  const loadedRef = useRef(false)
  const pinsRef = useRef(pins)
  const requestRef = useRef(request)
  const selectedRef = useRef(selectedId)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
    pinsRef.current = pins
    requestRef.current = request
    selectedRef.current = selectedId
  })

  // One map per container and language; pin changes never recreate it.
  useEffect(() => {
    const container = containerRef.current
    const first = pinsRef.current[0]
    if (container === null || first === undefined) return
    const created = new maplibregl.Map({
      attributionControl: false,
      center: [first.longitude, first.latitude],
      // Wheel zoom needs Ctrl so the page stays scrollable.
      cooperativeGestures: true,
      container,
      style: getAppMapStyle(i18n.language),
      zoom: 9,
    })
    created.addControl(new maplibregl.AttributionControl({ compact: true }))
    created.addControl(new maplibregl.NavigationControl(), 'top-right')
    loadedRef.current = false
    created.on('load', () => {
      loadedRef.current = true
      syncRoute(created, buildRoutes(pinsRef.current))
    })
    // Start on the current request (initially the whole journey), no animation.
    applyView(created, requestRef.current.view, false)
    const markers = markersRef.current
    setMap(created)
    return () => {
      markers.forEach(({ marker }) => {
        marker.remove()
      })
      markers.clear()
      created.remove()
      setMap(null)
    }
  }, [i18n.language])

  // Diff pins in place: update, add and remove markers; refresh the route.
  useEffect(() => {
    if (map === null) return
    const markers = markersRef.current
    const wanted = new Set(pins.map((pin) => pin.id))
    for (const [id, entry] of markers) {
      if (wanted.has(id)) continue
      entry.marker.remove()
      markers.delete(id)
    }
    for (const pin of pins) {
      const existing = markers.get(pin.id)
      if (existing !== undefined) {
        existing.marker.setLngLat([pin.longitude, pin.latitude])
        existing.el.style.background = pin.color
        existing.el.ariaLabel = pin.label
        continue
      }
      const el = document.createElement('button')
      el.type = 'button'
      el.ariaLabel = pin.label
      el.dataset.momentId = pin.id
      el.style.cssText = `width:16px;height:16px;border-radius:9999px;border:2px solid #fff;background:${pin.color};cursor:pointer;padding:0;transition:transform .12s`
      styleMarker(el, pin.id === selectedRef.current, false)
      el.addEventListener('click', () => {
        onSelectRef.current(pin.id)
      })
      markers.set(pin.id, {
        el,
        marker: new maplibregl.Marker({ element: el })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map),
      })
    }
    if (loadedRef.current) syncRoute(map, buildRoutes(pins))
  }, [map, pins])

  // Fly/fit when the workspace asks for a new view (outline, list, reset).
  const firstRequest = useRef(true)
  useEffect(() => {
    if (firstRequest.current) {
      firstRequest.current = false
      return
    }
    if (map !== null) applyView(map, request.view, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only an explicit request moves the camera, not a new map
  }, [request])

  useEffect(() => {
    for (const [id, { el }] of markersRef.current)
      styleMarker(el, id === selectedId, id === hover.get())
  }, [map, pins, selectedId, hover])

  useEffect(
    () =>
      hover.subscribe((hoveredId) => {
        for (const [id, { el }] of markersRef.current)
          styleMarker(el, id === selectedRef.current, id === hoveredId)
      }),
    [hover],
  )

  return (
    <div className="relative">
      <div
        aria-label={t('workspace.map')}
        className="h-80 overflow-hidden rounded-lg border border-border lg:h-[calc(100vh-9rem)]"
        ref={containerRef}
        role="region"
      />
      <button
        aria-label={t('workspace.mapReset')}
        className="absolute left-2 top-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background/95 px-2.5 text-xs font-semibold text-foreground shadow-soft hover:bg-surface"
        title={t('workspace.mapReset')}
        type="button"
        onClick={onReset}
      >
        <Maximize aria-hidden="true" size={14} />
        {t('workspace.mapReset')}
      </button>
    </div>
  )
}
