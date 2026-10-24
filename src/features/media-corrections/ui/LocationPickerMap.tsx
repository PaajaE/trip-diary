import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getAppMapStyle } from '@/shared/lib/map-style'

export interface PickedPoint {
  latitude: number
  longitude: number
}

interface LocationPickerMapProps {
  /** Where the map opens; null = world view. */
  centre: PickedPoint | null
  /** The chosen point (shown as a draggable pin); null = none yet. */
  point: PickedPoint | null
  /** The map failed to start (e.g. no WebGL); the numeric inputs still work. */
  onFail: () => void
  /** A tap on the map or the end of a pin drag. */
  onPick: (point: PickedPoint) => void
}

const WORLD_ZOOM = 1
const CLOSE_ZOOM = 12

function pointOf(lngLat: { lat: number; lng: number }): PickedPoint {
  return {
    latitude: lngLat.lat,
    // The map may wrap past the antimeridian; the database wants -180..180.
    longitude: ((((lngLat.lng + 180) % 360) + 360) % 360) - 180,
  }
}

/**
 * Map for choosing one point: tap anywhere or drag the pin. Loaded lazily by
 * the sheet, so MapLibre stays out of the main bundle.
 */
export function LocationPickerMap({
  centre,
  onFail,
  onPick,
  point,
}: LocationPickerMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const callbacks = useRef({ onFail, onPick })
  const initial = useRef({ centre, point })
  useEffect(() => {
    callbacks.current = { onFail, onPick }
  })

  // The map is created once; later changes only move the pin.
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const start = initial.current.point ?? initial.current.centre
    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        attributionControl: false,
        center: start === null ? [0, 20] : [start.longitude, start.latitude],
        container,
        cooperativeGestures: true,
        style: getAppMapStyle(i18n.language),
        zoom: start === null ? WORLD_ZOOM : CLOSE_ZOOM,
      })
    } catch {
      callbacks.current.onFail()
      return
    }
    mapRef.current = map
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    map.on('click', (event) => {
      callbacks.current.onPick(pointOf(event.lngLat))
    })
    map.on('error', () => {
      // Tile errors are not fatal; only a missing style/context is.
      if (!map.isStyleLoaded() && !map.loaded()) callbacks.current.onFail()
    })
    return () => {
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [i18n.language])

  const latitude = point?.latitude
  const longitude = point?.longitude
  useEffect(() => {
    const map = mapRef.current
    if (map === null) return
    if (latitude === undefined || longitude === undefined) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }
    if (markerRef.current === null) {
      const marker = new maplibregl.Marker({
        color: '#c46a4a',
        draggable: true,
      })
      marker.on('dragend', () => {
        callbacks.current.onPick(pointOf(marker.getLngLat()))
      })
      markerRef.current = marker.setLngLat([longitude, latitude]).addTo(map)
    } else {
      markerRef.current.setLngLat([longitude, latitude])
    }
  }, [latitude, longitude, i18n.language])

  return (
    <div
      aria-label={t('mediaCorrections.mapLabel')}
      className="h-56 w-full overflow-hidden rounded-lg border border-border bg-sunk"
      data-testid="location-picker-map"
      ref={containerRef}
      role="region"
    />
  )
}
