import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Crosshair, Maximize } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clusterBubbles,
  computeView,
  MAX_FIT_ZOOM,
  NO_BUBBLES,
  OVERVIEW_ZOOM,
  viewportCandidates,
  type BubbleCluster,
  type BubbleModel,
  type DayFocus,
  type HoverStore,
  type MapPin,
  type MapView,
  type PlaceCandidate,
} from '@/features/journey-workspace/model/workspace-map'
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
  focus: DayFocus
  hover: HoverStore
  onReset: () => void
  /** A pin clicked. */
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
const FIT_PADDING = 60
const PRIMARY = '#3d5c47'
const ACCENT = '#c46a4a'

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

/** Dashed day line; the layer is added on first call. */
function syncLayers(map: maplibregl.Map, focus: DayFocus): void {
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
  const lineSource = map.getSource<maplibregl.GeoJSONSource>(LINE_SOURCE)
  if (lineSource !== undefined) {
    lineSource.setData(line)
    return
  }
  map.addSource(LINE_SOURCE, { data: line, type: 'geojson' })
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
}

const RING = '0 1px 4px rgba(0,0,0,.35)'
const REFRESH_DELAY_MS = 100

type PinKind = 'focus' | 'thumb' | 'cluster'

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
  const sizes = {
    bare: { cluster: [34, 28], focus: [30, 22], thumb: [26, 20] },
    photo: { cluster: [52, 44], focus: [52, 40], thumb: [44, 34] },
  }[photo ? 'photo' : 'bare'][kind]
  const size = raised ? sizes[0] : sizes[1]
  const ring = kind === 'focus' ? 3 : 2
  el.style.width = String(size) + 'px'
  el.style.height = String(size) + 'px'
  setStacking(el, raised ? '4' : kind === 'focus' ? '3' : '2')
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
      badge.style.cssText = `position:absolute;right:-6px;bottom:-6px;min-width:20px;height:20px;padding:0 4px;border-radius:9999px;background:${PRIMARY};color:#fff;border:2px solid #fff;box-sizing:border-box;font:600 11px/16px system-ui,sans-serif;text-align:center`
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
  /** Extent of a cluster's members; null for a lone pin. */
  bounds: BubbleCluster['bounds']
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
      syncLayers(created, focusRef.current)
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
        bounds: null,
        el,
        kind: 'focus',
        marker: new maplibregl.Marker({ anchor: 'center', element: root })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map),
        photo,
      })
    }
    if (loadedRef.current) syncLayers(map, focus)
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
      const overview = zoom < OVERVIEW_ZOOM
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

      // Detail: out-of-focus moments as thumbnails, merged into counted
      // clusters where they would collide on screen.
      let clusters: BubbleCluster[] = []
      let visible = new Map<string, MapPin>()
      if (!overview) {
        const box = map.getBounds()
        const inView = viewportCandidates(
          pinsRef.current,
          {
            east: box.getEast(),
            north: box.getNorth(),
            south: box.getSouth(),
            west: box.getWest(),
          },
          current.numbers,
        )
        visible = new Map(inView.map((pin) => [pin.id, pin]))
        const occupied = pinsRef.current
          .filter((pin) => current.numbers.has(pin.id))
          .map((pin) => map.project([pin.longitude, pin.latitude]))
        // Cluster every out-of-focus pin so counts stay right at the edges.
        const candidates: PlaceCandidate[] = pinsRef.current
          .filter((pin) => !current.numbers.has(pin.id))
          .map((pin) => {
            const bubble = model.moments.get(pin.id)
            const point = map.project([pin.longitude, pin.latitude])
            return {
              id: pin.id,
              latitude: pin.latitude,
              longitude: pin.longitude,
              photoCount: bubble?.photoCount ?? 0,
              starred: bubble?.starred ?? false,
              x: point.x,
              y: point.y,
            }
          })
        clusters = clusterBubbles(occupied, candidates).filter((cluster) =>
          visible.has(cluster.id),
        )
      }
      const wanted = new Set(clusters.map((cluster) => cluster.id))
      for (const [id, entry] of thumbs) {
        if (wanted.has(id)) continue
        entry.marker.remove()
        thumbs.delete(id)
      }
      for (const cluster of clusters) {
        const pin = visible.get(cluster.id)
        if (pin === undefined) continue
        const url = model.moments.get(pin.id)?.url ?? null
        const photo = url !== null
        const kind: PinKind = cluster.count > 1 ? 'cluster' : 'thumb'
        const number = cluster.count > 1 ? cluster.count : null
        const existing = thumbs.get(pin.id)
        if (existing?.photo === photo) {
          existing.kind = kind
          existing.bounds = cluster.bounds
          fillMarker(existing.el, url, number)
          styleMarker(
            existing.el,
            kind,
            photo,
            pin.id === selectedRef.current,
            pin.id === hover.get(),
          )
          continue
        }
        existing?.marker.remove()
        const el = createPinElement(
          pin,
          () => {
            const bounds = thumbs.get(pin.id)?.bounds ?? null
            if (bounds === null) onSelectRef.current(pin.id)
            else applyView(map, { bounds, type: 'bounds' }, true)
          },
          photo,
        )
        fillMarker(el, url, number)
        const root = wrapMarker(el, 52)
        styleMarker(
          el,
          kind,
          photo,
          pin.id === selectedRef.current,
          pin.id === hover.get(),
        )
        thumbs.set(pin.id, {
          bounds: cluster.bounds,
          el,
          kind,
          marker: new maplibregl.Marker({ anchor: 'center', element: root })
            .setLngLat([pin.longitude, pin.latitude])
            .addTo(map),
          photo,
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
    <div className="relative">
      <div
        aria-label={t('workspace.map')}
        className="h-80 overflow-hidden rounded-lg border border-border lg:h-[calc(100vh-9rem)]"
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
