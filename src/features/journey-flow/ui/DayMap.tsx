import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getAppMapStyle } from '@/shared/lib/map-style'

export interface DayMapPin {
  id: string
  label: string
  latitude: number
  longitude: number
  number: number
}

const LINE_SOURCE = 'flow-day-line'
const BASE =
  'grid size-11 place-items-center rounded-full border-2 border-white bg-primary text-sm font-bold text-primary-foreground shadow-soft'
const SELECTED = ' ring-4 ring-accent scale-110'

function pinElement(pin: DayMapPin, onClick: () => void): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.ariaLabel = pin.label
  el.title = pin.label
  el.className = BASE
  el.textContent = String(pin.number)
  el.addEventListener('click', onClick)
  return el
}

function highlight(
  elements: ReadonlyMap<string, HTMLButtonElement>,
  selectedId: string | null,
): void {
  for (const [id, el] of elements) {
    el.className = id === selectedId ? BASE + SELECTED : BASE
    el.style.zIndex = id === selectedId ? '2' : '1'
  }
}

/**
 * Map of one day: numbered stops, the selected one highlighted, a dashed
 * line along the way (rides and moves between the stops). Reuses the app's
 * map style; the pins are 44 px touch targets.
 */
/** Room around the pins when the map frames the day. */
const FIT_PADDING = { bottom: 56, left: 36, right: 36, top: 36 }

export function DayMap({
  className,
  onSelect,
  pins,
  selectedId,
}: {
  className?: string
  onSelect: (stopId: string) => void
  pins: readonly DayMapPin[]
  selectedId: string | null
}) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelect)
  const selectedRef = useRef(selectedId)
  const elementsRef = useRef(new Map<string, HTMLButtonElement>())
  const pinsRef = useRef(pins)
  useEffect(() => {
    onSelectRef.current = onSelect
    selectedRef.current = selectedId
    pinsRef.current = pins
  })

  const signature = pins
    .map(
      (p) =>
        `${p.id}:${String(p.number)}:${String(p.longitude)},${String(p.latitude)}`,
    )
    .join('|')
  useEffect(() => {
    const container = containerRef.current
    const current = pinsRef.current
    const first = current[0]
    if (container === null || first === undefined) return
    const map = new maplibregl.Map({
      attributionControl: false,
      center: [first.longitude, first.latitude],
      container,
      cooperativeGestures: true,
      style: getAppMapStyle(i18n.language),
      zoom: 10,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    const elements = elementsRef.current
    elements.clear()
    const markers = current.map((pin) => {
      const el = pinElement(pin, () => {
        onSelectRef.current(pin.id)
      })
      if (pin.id === selectedRef.current) el.className = BASE + SELECTED
      elements.set(pin.id, el)
      return new maplibregl.Marker({ element: el })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(map)
    })
    const coordinates = current.map(
      (pin) => [pin.longitude, pin.latitude] as [number, number],
    )
    if (coordinates.length > 1) {
      const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      for (const c of coordinates) bounds.extend(c)
      // Pins (about 28 px) stay off the edges; more room at the bottom for
      // the attribution.
      map.fitBounds(bounds, {
        animate: false,
        maxZoom: 14,
        padding: FIT_PADDING,
      })
    }
    map.on('load', () => {
      map.addSource(LINE_SOURCE, {
        data: {
          geometry: { coordinates, type: 'LineString' },
          properties: {},
          type: 'Feature',
        },
        type: 'geojson',
      })
      map.addLayer({
        id: LINE_SOURCE,
        paint: {
          'line-color': '#3d5c47',
          'line-dasharray': [2, 2],
          'line-opacity': 0.7,
          'line-width': 2,
        },
        source: LINE_SOURCE,
        type: 'line',
      })
    })
    return () => {
      for (const marker of markers) marker.remove()
      elements.clear()
      map.remove()
    }
  }, [signature, i18n.language])

  // Highlight follows the selection without rebuilding the map.
  useEffect(() => {
    highlight(elementsRef.current, selectedId)
  }, [selectedId, signature])

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border bg-sunk ${className ?? 'h-56'}`}
    >
      <div
        aria-label={t('flow.screen.review.mapLabel')}
        className="h-full w-full"
        ref={containerRef}
        role="region"
      />
      {pins.length === 0 ? (
        <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted">
          {t('flow.screen.review.mapNoPoints')}
        </p>
      ) : null}
    </div>
  )
}
