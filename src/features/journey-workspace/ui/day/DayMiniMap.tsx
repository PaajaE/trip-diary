import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { DayStop } from '@/features/journey-workspace/model/day-stops'
import {
  MAP_VARIANTS,
  variantUrl,
} from '@/features/journey-workspace/ui/day/media-url'
import { getAppMapStyle } from '@/shared/lib/map-style'

const LINE_SOURCE = 'day-route'
const LINE_LAYER = 'day-route-line'

interface DayMiniMapProps {
  baseUrl: string
  className?: string
  onSelectStop: (stopId: string) => void
  stops: readonly DayStop[]
}

interface Point {
  index: number
  lngLat: [number, number]
  stop: DayStop
}

function pointsOf(stops: readonly DayStop[]): Point[] {
  return stops.flatMap((stop, index) =>
    stop.centre === null
      ? []
      : [
          {
            index,
            lngLat: [stop.centre.longitude, stop.centre.latitude] as [
              number,
              number,
            ],
            stop,
          },
        ],
  )
}

function markerElement(
  point: Point,
  baseUrl: string,
  onClick: () => void,
): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.ariaLabel = point.stop.title ?? String(point.index + 1)
  el.className =
    'relative size-9 rounded-full border-2 border-white bg-primary-soft bg-cover bg-center shadow-soft'
  const cover = point.stop.hero
  const url = cover === null ? null : variantUrl(cover, MAP_VARIANTS, baseUrl)
  if (url !== null) el.style.backgroundImage = `url("${url}")`
  const badge = document.createElement('span')
  badge.textContent = String(point.index + 1)
  badge.className =
    'absolute -bottom-1 -right-1 grid size-[18px] place-items-center rounded-full border-2 border-white bg-primary text-[10px] font-bold text-primary-foreground'
  el.append(badge)
  el.addEventListener('click', onClick)
  return el
}

/** Small map of the day: numbered stop bubbles on a dashed route. */
export function DayMiniMap({
  baseUrl,
  className,
  onSelectStop,
  stops,
}: DayMiniMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const onSelectRef = useRef(onSelectStop)
  const points = pointsOf(stops)
  const hasPoints = points.length > 0
  const pointsRef = useRef(points)
  const baseUrlRef = useRef(baseUrl)
  useEffect(() => {
    onSelectRef.current = onSelectStop
    pointsRef.current = points
    baseUrlRef.current = baseUrl
  })

  // Rebuilt only when the set of positioned stops (or the language) changes.
  const signature = points
    .map((p) => `${p.stop.id}:${String(p.lngLat[0])},${String(p.lngLat[1])}`)
    .join('|')
  useEffect(() => {
    const container = containerRef.current
    const current = pointsRef.current
    if (container === null || current.length === 0) return
    const first = current[0]
    if (first === undefined) return
    const map = new maplibregl.Map({
      attributionControl: false,
      center: first.lngLat,
      container,
      cooperativeGestures: true,
      style: getAppMapStyle(i18n.language),
      zoom: 10,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    const markers = current.map((point) =>
      new maplibregl.Marker({
        element: markerElement(point, baseUrlRef.current, () => {
          onSelectRef.current(point.stop.id)
        }),
      })
        .setLngLat(point.lngLat)
        .addTo(map),
    )
    const coordinates = current.map((point) => point.lngLat)
    if (coordinates.length > 1) {
      const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0])
      for (const c of coordinates) bounds.extend(c)
      map.fitBounds(bounds, { animate: false, maxZoom: 13, padding: 36 })
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
        id: LINE_LAYER,
        paint: {
          'line-color': '#3d5c47',
          'line-dasharray': [1, 2],
          'line-width': 2,
        },
        source: LINE_SOURCE,
        type: 'line',
      })
    })
    return () => {
      for (const marker of markers) marker.remove()
      map.remove()
    }
  }, [signature, i18n.language])

  return (
    <div
      className={`relative overflow-hidden rounded-md border border-border bg-sunk ${className ?? 'h-56'}`}
    >
      <div
        aria-label={t('dayDetail.map')}
        className="h-full w-full"
        ref={containerRef}
        role="region"
      />
      {hasPoints ? null : (
        <p className="absolute inset-0 grid place-items-center p-4 text-center text-sm text-muted">
          {t('dayDetail.mapNoPoints')}
        </p>
      )}
    </div>
  )
}
