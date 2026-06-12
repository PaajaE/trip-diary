import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useTranslation } from 'react-i18next'
import type { JourneyDetail } from '@/entities/journey/model/journey'

interface JourneyMapProps {
  stops: JourneyDetail['stops']
}

export function JourneyMap({ stops }: JourneyMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mappedStops = useMemo(
    () =>
      stops.filter(
        (stop) =>
          stop.mapLatitude !== null &&
          stop.mapLongitude !== null &&
          Number.isFinite(stop.mapLatitude) &&
          Number.isFinite(stop.mapLongitude),
      ),
    [stops],
  )

  useEffect(() => {
    const container = containerRef.current
    const first = mappedStops[0]
    if (
      container === null ||
      first?.mapLatitude === undefined ||
      first.mapLatitude === null ||
      first.mapLongitude === null
    ) {
      return
    }

    const map = new maplibregl.Map({
      attributionControl: false,
      center: [first.mapLongitude, first.mapLatitude],
      container,
      style: {
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        layers: [
          {
            id: 'osm',
            source: 'osm',
            type: 'raster',
          },
        ],
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
    for (const stop of mappedStops) {
      if (stop.mapLatitude === null || stop.mapLongitude === null) {
        continue
      }
      const point: [number, number] = [stop.mapLongitude, stop.mapLatitude]
      bounds.extend(point)
      new maplibregl.Marker({
        color: stop.status === 'visited' ? '#285943' : '#bf6b3d',
      })
        .setLngLat(point)
        .setPopup(new maplibregl.Popup().setText(stop.title))
        .addTo(map)
    }
    if (mappedStops.length > 1) {
      map.fitBounds(bounds, { maxZoom: 9, padding: 56 })
    }

    return () => {
      map.remove()
    }
  }, [mappedStops])

  return mappedStops.length === 0 ? null : (
    <div
      aria-label={t('journey.map')}
      className="mt-8 h-80 overflow-hidden rounded-lg border border-border sm:h-96"
      ref={containerRef}
      role="region"
    />
  )
}
