import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTranslation } from 'react-i18next'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import {
  getJourneyMapPoints,
  type JourneyMapPoint,
} from '@/features/journeys/ui/journey-map-points'

interface JourneyMapProps {
  moments: JourneyMoment[]
  plannedStops: NonNullable<JourneyMoment['stop']>[]
}

export function JourneyMap({ moments, plannedStops }: JourneyMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const points = useMemo(
    () => getJourneyMapPoints(moments, plannedStops),
    [moments, plannedStops],
  )

  useEffect(() => {
    const container = containerRef.current
    const first = points[0]
    if (container === null || first === undefined) {
      return
    }

    const map = new maplibregl.Map({
      attributionControl: false,
      center: [first.longitude, first.latitude],
      container,
      style: {
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        layers: [{ id: 'osm', source: 'osm', type: 'raster' }],
        sources: {
          osm: {
            attribution: '© OpenStreetMap contributors',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            type: 'raster',
          },
        },
        version: 8,
      },
      zoom: 5,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const bounds = new maplibregl.LngLatBounds()
    for (const point of points) {
      const coordinates: [number, number] = [point.longitude, point.latitude]
      bounds.extend(coordinates)
      new maplibregl.Marker({
        color: point.type === 'moment' ? '#285943' : '#bf6b3d',
      })
        .setLngLat(coordinates)
        .setPopup(createPointPopup(point, t('journey.openMoment')))
        .addTo(map)
    }
    if (points.length > 1) {
      map.fitBounds(bounds, { maxZoom: 9, padding: 56 })
    }

    return () => {
      map.remove()
    }
  }, [points, t])

  return points.length === 0 ? null : (
    <div
      aria-label={t('journey.map')}
      className="mt-8 h-80 overflow-hidden rounded-lg border border-border sm:h-96"
      ref={containerRef}
      role="region"
    />
  )
}

function createPointPopup(point: JourneyMapPoint, openMomentLabel: string) {
  const content = document.createElement('div')
  const title = document.createElement('strong')
  title.textContent = point.title
  content.append(title)

  if (point.entryId !== null) {
    const link = document.createElement('a')
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
    link.href = `${basePath}/e/${encodeURIComponent(point.entryId)}`
    link.textContent = openMomentLabel
    link.style.display = 'block'
    link.style.marginTop = '0.35rem'
    content.append(link)
  }

  return new maplibregl.Popup().setDOMContent(content)
}
