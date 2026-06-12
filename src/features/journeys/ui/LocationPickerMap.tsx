import maplibregl from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { JourneyDetail } from '@/entities/journey/model/journey'

interface LocationPickerMapProps {
  heightClassName?: string
  onSelectPoint: (point: { latitude: number; longitude: number }) => void
  selectedPoint: { latitude: number; longitude: number } | null
  stops: JourneyDetail['stops']
}

type MappedStop = JourneyDetail['stops'][number] & {
  mapLatitude: number
  mapLongitude: number
}

export function LocationPickerMap({
  heightClassName = 'h-72',
  onSelectPoint,
  selectedPoint,
  stops,
}: LocationPickerMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mappedStops = useMemo(
    () =>
      stops.filter(
        (stop): stop is MappedStop =>
          stop.mapLatitude !== null && stop.mapLongitude !== null,
      ),
    [stops],
  )

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return

    const firstMappedStop = mappedStops[0]
    const initialCenter: [number, number] =
      firstMappedStop !== undefined
        ? [firstMappedStop.mapLongitude, firstMappedStop.mapLatitude]
        : [14.4378, 50.0755]

    const map = new maplibregl.Map({
      attributionControl: false,
      center: initialCenter,
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
      zoom: mappedStops.length > 0 ? 5 : 4,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    const bounds = new maplibregl.LngLatBounds()
    for (const stop of mappedStops) {
      const point: [number, number] = [stop.mapLongitude, stop.mapLatitude]
      bounds.extend(point)
      new maplibregl.Marker({ color: '#285943' })
        .setLngLat(point)
        .setPopup(new maplibregl.Popup().setText(stop.title))
        .addTo(map)
    }

    if (mappedStops.length > 1) {
      map.fitBounds(bounds, { maxZoom: 8, padding: 48 })
    }

    const draftMarker = new maplibregl.Marker({ color: '#b85f42' })
    if (selectedPoint !== null) {
      draftMarker
        .setLngLat([selectedPoint.longitude, selectedPoint.latitude])
        .addTo(map)
    }

    map.on('click', (event) => {
      const point = {
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      }
      onSelectPoint(point)
      draftMarker.setLngLat([point.longitude, point.latitude]).addTo(map)
    })

    return () => {
      map.remove()
    }
  }, [mappedStops, onSelectPoint, selectedPoint])

  return (
    <div>
      <div
        aria-label={t('journey.mapPicker')}
        className={`${heightClassName} overflow-hidden rounded-xl border border-border`}
        ref={containerRef}
        role="region"
      />
      <p className="mt-3 text-sm text-muted">{t('journey.mapPickerHelp')}</p>
    </div>
  )
}
