import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Crosshair, Maximize } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  computeView,
  DETAIL_ZOOM,
  MAX_FIT_ZOOM,
  MAX_THUMB_CANDIDATES,
  NO_BUBBLES,
  OVERVIEW_ZOOM,
  placeBubbles,
  viewportCandidates,
  type BubbleModel,
  type DayFocus,
  type HoverStore,
  type MapPin,
  type MapView,
  type PlaceCandidate,
} from '@/features/journey-workspace/model/workspace-map'
import { cn } from '@/shared/lib/cn'
import { getAppMapStyle } from '@/shared/lib/map-style'

/** What the map should show; a new `nonce` re-applies the same view. */
export interface MapViewRequest {
  nonce: number
  view: MapView | null
}

interface WorkspaceMapProps {
  /** Cover thumbnails of moments and stages; absent = plain numbered pins. */
  bubbles?: BubbleModel
  /** Short description of the focused day ("Wed 3 Jun · 5 places"). */
  caption: string | null
  /** Fill the parent's height instead of the fixed map height. */
  fill?: boolean
  focus: DayFocus
  hover: HoverStore
  onReset: () => void
  /** A pin or dot clicked. */
  onSelect: (momentId: string) => void
  /** A stage bubble clicked; without it the map just fits the stage. */
  onSelectStage?: (segmentId: string) => void
  /** The floating "zoom to day" button was pressed. */
  onZoomDay: () => void
  pins: MapPin[]
  request: MapViewRequest
  selectedId: string | null
  /** Offer "zoom to day": the focused day is not what the camera shows. */
  showZoomDay: boolean
  /** Moment ids of every top-level stage, for fitting the map to it. */
  stageMomentIds?: ReadonlyMap<string, readonly string[]>
}

const LINE_SOURCE = 'workspace-day-line'
const DOT_SOURCE = 'workspace-dots'
const FIT_PADDING = 60
const PRIMARY = '#3d5c47'
const ACCENT = '#c46a4a'
const MUTED = '#5f675e'

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

/** Dashed day line and out-of-focus dots; layers are added on first call. */
function syncLayers(
  map: maplibregl.Map,
  pins: readonly MapPin[],
  focus: DayFocus,
): void {
  const line = {
    features:
      focus.line === null
        ? []
        : [
            {
              geometry: {
                coordinates: focus.line,
                type: 'LineString' as const,
              },
              properties: {},
              type: 'Feature' as const,
            },
          ],
    type: 'FeatureCollection' as const,
  }
  const dots = {
    features: pins
      .filter((pin) => !focus.numbers.has(pin.id))
      .map((pin) => ({
        geometry: {
          coordinates: [pin.longitude, pin.latitude],
          type: 'Point' as const,
        },
        properties: { id: pin.id },
        type: 'Feature' as const,
      })),
    type: 'FeatureCollection' as const,
  }
  const lineSource = map.getSource<maplibregl.GeoJSONSource>(LINE_SOURCE)
  const dotSource = map.getSource<maplibregl.GeoJSONSource>(DOT_SOURCE)
  if (lineSource !== undefined && dotSource !== undefined) {
    lineSource.setData(line)
    dotSource.setData(dots)
    return
  }
  map.addSource(LINE_SOURCE, { data: line, type: 'geojson' })
  map.addSource(DOT_SOURCE, { data: dots, type: 'geojson' })
  map.addLayer({
    id: LINE_SOURCE,
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': PRIMARY,
      'line-dasharray': [2, 2],
      'line-opacity': 0.7,
      'line-width': 2,
    },
    source: LINE_SOURCE,
    type: 'line',
  })
  map.addLayer({
    id: DOT_SOURCE,
    paint: {
      'circle-color': MUTED,
      'circle-opacity': 0.45,
      'circle-radius': 3,
      'circle-stroke-opacity': 0,
      'circle-stroke-width': 6,
    },
    source: DOT_SOURCE,
    type: 'circle',
  })
}

const RING = '0 1px 4px rgba(0,0,0,.35)'
const REFRESH_DELAY_MS = 100

type PinKind = 'focus' | 'thumb'

/**
 * maplibre owns the marker root: its class gives `position:absolute` and it
 * writes the inline `transform`. The root is therefore a bare flex wrapper of
 * fixed size that never gets position/top/left/transform; all visuals live on
 * the inner element, which is the only thing restyled later.
 */
function wrapMarker(inner: HTMLElement, size: number): HTMLDivElement {
  const root = document.createElement('div')
  root.style.width = String(size) + 'px'
  root.style.height = String(size) + 'px'
  root.style.display = 'flex'
  root.style.alignItems = 'center'
  root.style.justifyContent = 'center'
  root.style.pointerEvents = 'none'
  inner.style.pointerEvents = 'auto'
  root.append(inner)
  return root
}

/** Stacking is set on the wrapper (it is a stacking context via transform). */
function setStacking(inner: HTMLElement, zIndex: string) {
  const root = inner.parentElement
  if (root !== null) root.style.zIndex = zIndex
}

/** Size, ring and stacking of a pin; hovered/selected pins grow, not scale. */
function styleMarker(
  el: HTMLElement,
  kind: PinKind,
  photo: boolean,
  active: boolean,
  hovered: boolean,
) {
  const raised = active || hovered
  const size = !photo
    ? raised
      ? 30
      : 22
    : kind === 'thumb'
      ? raised
        ? 40
        : 28
      : raised
        ? 52
        : 40
  const ring = kind === 'thumb' ? 2 : 3
  el.style.width = String(size) + 'px'
  el.style.height = String(size) + 'px'
  setStacking(el, raised ? '3' : kind === 'focus' ? '2' : '1')
  if (photo) {
    el.style.border = String(ring) + `px solid ${raised ? ACCENT : '#fff'}`
    el.style.boxShadow = RING
  } else {
    el.style.border = '0'
    el.style.boxShadow = raised
      ? `0 0 0 2px #fff, 0 0 0 4px ${ACCENT}, 0 1px 4px rgba(0,0,0,.4)`
      : '0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,.35)'
  }
}

/** Fills a pin: cover photo plus number badge, or the bare number. */
function fillMarker(
  el: HTMLElement,
  url: string | null,
  number: number | null,
) {
  const signature = `${url ?? ''}|${String(number ?? '')}`
  if (el.dataset.signature === signature) return
  el.dataset.signature = signature
  el.textContent = ''
  if (url !== null) {
    const img = document.createElement('img')
    img.alt = ''
    img.decoding = 'async'
    img.setAttribute('loading', 'lazy')
    img.src = url
    img.draggable = false
    img.style.cssText =
      'width:100%;height:100%;border-radius:9999px;object-fit:cover;display:block;background:#e7e5df'
    el.append(img)
    if (number !== null) {
      const badge = document.createElement('span')
      badge.dataset.badge = ''
      badge.textContent = String(number)
      badge.style.cssText = `position:absolute;right:-6px;bottom:-6px;width:18px;height:18px;border-radius:9999px;background:${PRIMARY};color:#fff;border:2px solid #fff;box-sizing:border-box;font:600 10px/14px system-ui,sans-serif;text-align:center`
      el.append(badge)
    }
  } else if (number !== null) {
    el.textContent = String(number)
  }
}

function createPinElement(
  pin: MapPin,
  onClick: () => void,
  photo: boolean,
): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.ariaLabel = pin.label
  el.title = pin.label
  el.dataset.momentId = pin.id
  el.style.cssText = `box-sizing:border-box;position:relative;border-radius:9999px;background:${PRIMARY};color:#fff;font:600 11px/22px system-ui,sans-serif;text-align:center;cursor:pointer;padding:0;transition:width .12s,height .12s`
  if (photo) el.style.background = '#fff'
  el.addEventListener('click', onClick)
  return el
}

interface PinMarker {
  el: HTMLButtonElement
  kind: PinKind
  marker: maplibregl.Marker
  photo: boolean
}

interface StageMarker {
  el: HTMLButtonElement
  marker: maplibregl.Marker
}

export function WorkspaceMap({
  bubbles = NO_BUBBLES,
  caption,
  fill = false,
  focus,
  hover,
  onReset,
  onSelect,
  onSelectStage,
  onZoomDay,
  pins,
  request,
  selectedId,
  showZoomDay,
  stageMomentIds,
}: WorkspaceMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const markersRef = useRef(new Map<string, PinMarker>())
  const thumbsRef = useRef(new Map<string, PinMarker>())
  const stagesRef = useRef(new Map<string, StageMarker>())
  const refreshRef = useRef<() => void>(() => undefined)
  const loadedRef = useRef(false)
  const pinsRef = useRef(pins)
  const focusRef = useRef(focus)
  const requestRef = useRef(request)
  const selectedRef = useRef(selectedId)
  const onSelectRef = useRef(onSelect)
  const onSelectStageRef = useRef(onSelectStage)
  const bubblesRef = useRef(bubbles)
  const stageIdsRef = useRef(stageMomentIds)
  useEffect(() => {
    onSelectRef.current = onSelect
    onSelectStageRef.current = onSelectStage
    bubblesRef.current = bubbles
    stageIdsRef.current = stageMomentIds
    pinsRef.current = pins
    focusRef.current = focus
    requestRef.current = request
    selectedRef.current = selectedId
  })

  // One map per container and language; pin and focus changes never recreate it.
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
      syncLayers(created, pinsRef.current, focusRef.current)
    })
    created.on('click', DOT_SOURCE, (event) => {
      const id: unknown = event.features?.[0]?.properties.id
      if (typeof id === 'string') onSelectRef.current(id)
    })
    created.on('mouseenter', DOT_SOURCE, () => {
      created.getCanvas().style.cursor = 'pointer'
    })
    created.on('mouseleave', DOT_SOURCE, () => {
      created.getCanvas().style.cursor = ''
    })
    // Start on the current request (initially the whole journey), no animation.
    applyView(created, requestRef.current.view, false)
    const markers = markersRef.current
    const thumbs = thumbsRef.current
    const stages = stagesRef.current
    // Bubbles follow the camera only once it has settled; bursts are merged.
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        refreshRef.current()
      }, REFRESH_DELAY_MS)
    }
    created.on('moveend', schedule)
    created.on('zoomend', schedule)
    setMap(created)
    return () => {
      if (timer !== null) clearTimeout(timer)
      for (const group of [markers, thumbs, stages]) {
        group.forEach(({ marker }) => {
          marker.remove()
        })
        group.clear()
      }
      created.remove()
      setMap(null)
    }
  }, [i18n.language])

  // Focused-day markers: cover bubbles (numbered circles without a cover).
  useEffect(() => {
    if (map === null) return
    const markers = markersRef.current
    for (const [id, entry] of markers) {
      if (focus.numbers.has(id)) continue
      entry.marker.remove()
      markers.delete(id)
    }
    for (const pin of pins) {
      const number = focus.numbers.get(pin.id)
      if (number === undefined) continue
      const url = bubbles.moments.get(pin.id)?.url ?? null
      const existing = markers.get(pin.id)
      if (existing?.photo === (url !== null)) {
        existing.marker.setLngLat([pin.longitude, pin.latitude])
        fillMarker(existing.el, url, number)
        existing.el.ariaLabel = pin.label
        existing.el.title = pin.label
        continue
      }
      existing?.marker.remove()
      const photo = url !== null
      const el = createPinElement(
        pin,
        () => {
          onSelectRef.current(pin.id)
        },
        photo,
      )
      fillMarker(el, url, number)
      const root = wrapMarker(el, 52)
      styleMarker(el, 'focus', photo, pin.id === selectedRef.current, false)
      markers.set(pin.id, {
        el,
        kind: 'focus',
        marker: new maplibregl.Marker({ anchor: 'center', element: root })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map),
        photo,
      })
    }
    if (loadedRef.current) syncLayers(map, pins, focus)
  }, [map, pins, focus, bubbles])

  // Stage bubbles (overview) and small thumbnails (detail), from the camera.
  useEffect(() => {
    if (map === null) return
    const thumbs = thumbsRef.current
    const stages = stagesRef.current
    const clear = (group: Map<string, { marker: maplibregl.Marker }>) => {
      for (const { marker } of group.values()) marker.remove()
      group.clear()
    }
    refreshRef.current = () => {
      const zoom = map.getZoom()
      const current = focusRef.current
      const model = bubblesRef.current

      // Overview: one bubble per stage with a cover.
      const overview = zoom < OVERVIEW_ZOOM || current.numbers.size === 0
      const wantedStages = overview ? model.stages : []
      for (const [id, entry] of stages) {
        if (wantedStages.some((stage) => stage.id === id)) continue
        entry.marker.remove()
        stages.delete(id)
      }
      for (const stage of wantedStages) {
        const existing = stages.get(stage.id)
        if (existing !== undefined) {
          existing.marker.setLngLat([stage.longitude, stage.latitude])
          continue
        }
        const el = document.createElement('button')
        const label = t('workspace.mapStage', { title: stage.title })
        el.type = 'button'
        el.ariaLabel = label
        el.dataset.stageId = stage.id
        el.style.cssText =
          'box-sizing:border-box;position:relative;width:44px;height:44px;border-radius:9999px;border:3px solid #fff;background:#fff;padding:0;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35)'
        const img = document.createElement('img')
        img.alt = ''
        img.decoding = 'async'
        img.setAttribute('loading', 'lazy')
        img.src = stage.url
        img.draggable = false
        img.style.cssText =
          'width:100%;height:100%;border-radius:9999px;object-fit:cover;display:block'
        const tip = document.createElement('span')
        tip.textContent = stage.title
        tip.hidden = true
        tip.style.cssText =
          'position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:4px;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis;padding:2px 8px;border-radius:8px;background:rgba(255,255,255,.95);color:#222;font:600 11px/16px system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.3);pointer-events:none'
        el.append(img, tip)
        const root = wrapMarker(el, 44)
        root.style.zIndex = '1'
        el.addEventListener('mouseenter', () => {
          tip.hidden = false
          setStacking(el, '3')
        })
        el.addEventListener('mouseleave', () => {
          tip.hidden = true
          setStacking(el, '1')
        })
        el.addEventListener('click', () => {
          const callback = onSelectStageRef.current
          if (callback !== undefined) {
            callback(stage.id)
            return
          }
          const ids = stageIdsRef.current?.get(stage.id)
          const view = computeView(pinsRef.current, ids ?? null)
          if (view !== null) applyView(map, view, true)
        })
        stages.set(stage.id, {
          el,
          marker: new maplibregl.Marker({ anchor: 'center', element: root })
            .setLngLat([stage.longitude, stage.latitude])
            .addTo(map),
        })
      }

      // Detail: small thumbnails for out-of-focus moments, collision-free.
      let keep: PlaceCandidate[] = []
      let occupied: { x: number; y: number }[] = []
      let candidates: MapPin[] = []
      if (zoom >= DETAIL_ZOOM) {
        const box = map.getBounds()
        candidates = viewportCandidates(
          pinsRef.current,
          {
            east: box.getEast(),
            north: box.getNorth(),
            south: box.getSouth(),
            west: box.getWest(),
          },
          current.numbers,
          model.moments,
        )
        if (candidates.length > MAX_THUMB_CANDIDATES) candidates = []
        occupied = pinsRef.current
          .filter((pin) => current.numbers.has(pin.id))
          .map((pin) => map.project([pin.longitude, pin.latitude]))
        keep = candidates.flatMap((pin) => {
          const bubble = model.moments.get(pin.id)
          if (bubble === undefined) return []
          const point = map.project([pin.longitude, pin.latitude])
          return [
            {
              id: pin.id,
              photoCount: bubble.photoCount,
              starred: bubble.starred,
              x: point.x,
              y: point.y,
            },
          ]
        })
      }
      const placed = new Set(placeBubbles(occupied, keep))
      for (const [id, entry] of thumbs) {
        if (placed.has(id)) continue
        entry.marker.remove()
        thumbs.delete(id)
      }
      for (const pin of candidates) {
        if (!placed.has(pin.id) || thumbs.has(pin.id)) continue
        const url = model.moments.get(pin.id)?.url ?? null
        if (url === null) continue
        const el = createPinElement(
          pin,
          () => {
            onSelectRef.current(pin.id)
          },
          true,
        )
        fillMarker(el, url, null)
        const root = wrapMarker(el, 40)
        styleMarker(
          el,
          'thumb',
          true,
          pin.id === selectedRef.current,
          pin.id === hover.get(),
        )
        thumbs.set(pin.id, {
          el,
          kind: 'thumb',
          marker: new maplibregl.Marker({ anchor: 'center', element: root })
            .setLngLat([pin.longitude, pin.latitude])
            .addTo(map),
          photo: true,
        })
      }
    }
    refreshRef.current()
    return () => {
      refreshRef.current = () => undefined
      clear(thumbs)
      clear(stages)
    }
  }, [map, hover, t])

  useEffect(() => {
    refreshRef.current()
  }, [pins, focus, bubbles])

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
    for (const group of [markersRef.current, thumbsRef.current])
      for (const [id, { el, kind, photo }] of group)
        styleMarker(el, kind, photo, id === selectedId, id === hover.get())
  }, [map, pins, focus, bubbles, selectedId, hover])

  useEffect(
    () =>
      hover.subscribe((hoveredId) => {
        for (const group of [markersRef.current, thumbsRef.current])
          for (const [id, { el, kind, photo }] of group)
            styleMarker(
              el,
              kind,
              photo,
              id === selectedRef.current,
              id === hoveredId,
            )
      }),
    [hover],
  )

  const chip = 'rounded-lg border border-border bg-background/95 shadow-soft'
  return (
    <div className={cn('relative', fill && 'h-full')}>
      <div
        aria-label={t('workspace.map')}
        className={cn(
          'overflow-hidden rounded-lg border border-border',
          fill ? 'h-full' : 'h-80 lg:h-[calc(100vh-9rem)]',
        )}
        ref={containerRef}
        role="region"
      />
      <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-4rem)] flex-col items-start gap-1.5">
        {caption === null ? null : (
          <p
            className={`${chip} px-2.5 py-1 text-xs font-semibold text-foreground`}
            data-testid="map-caption"
          >
            {caption}
          </p>
        )}
        <button
          aria-label={t('workspace.mapReset')}
          className={`${chip} pointer-events-auto inline-flex min-h-9 items-center gap-1.5 px-2.5 text-xs font-semibold text-foreground hover:bg-surface`}
          title={t('workspace.mapReset')}
          type="button"
          onClick={onReset}
        >
          <Maximize aria-hidden="true" size={14} />
          {t('workspace.mapReset')}
        </button>
      </div>
      {showZoomDay ? (
        <button
          className={`${chip} absolute bottom-6 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1.5 px-3 text-xs font-semibold text-primary hover:bg-surface`}
          type="button"
          onClick={onZoomDay}
        >
          <Crosshair aria-hidden="true" size={14} />
          {t('workspace.mapZoomDay')}
        </button>
      ) : null}
    </div>
  )
}
