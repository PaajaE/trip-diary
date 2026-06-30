import maplibregl from 'maplibre-gl'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { getAppMapStyle } from '@/shared/lib/map-style'

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

const SELECTED_POINT_ZOOM = 13

function LocationPickerMapE2E({
  heightClassName = 'h-72',
}: Pick<LocationPickerMapProps, 'heightClassName'>) {
  const { t } = useTranslation()

  return (
    <div>
      <div
        aria-label={t('journey.mapPicker')}
        className={`${heightClassName} flex items-center justify-center overflow-hidden rounded-xl border border-border bg-surface text-sm text-muted`}
        role="region"
      >
        {t('journey.mapPicker')}
      </div>
      <p className="mt-3 text-sm text-muted">{t('journey.mapPickerHelp')}</p>
    </div>
  )
}

function LocationPickerMapInteractive({
  heightClassName = 'h-72',
  onSelectPoint,
  selectedPoint,
  stops,
}: LocationPickerMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const draftMarkerRef = useRef<maplibregl.Marker | null>(null)
  const onSelectPointRef = useRef(onSelectPoint)
  const selectedPointRef = useRef(selectedPoint)

  useEffect(() => {
    onSelectPointRef.current = onSelectPoint
    selectedPointRef.current = selectedPoint
  })

  const mappedStops = useMemo(
    () =>
      stops.filter(
        (stop): stop is MappedStop =>
          stop.mapLatitude !== null &&
          stop.mapLongitude !== null &&
          Number.isFinite(stop.mapLatitude) &&
          Number.isFinite(stop.mapLongitude),
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
      style: getAppMapStyle(i18n.language),
      zoom: mappedStops.length > 0 ? 5 : 4,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

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
    draftMarkerRef.current = draftMarker

    function applySelectedPointFromRef() {
      const activeMap = mapRef.current
      const marker = draftMarkerRef.current
      const point = selectedPointRef.current
      if (activeMap === null || marker === null) {
        return
      }

      if (
        point === null ||
        !Number.isFinite(point.latitude) ||
        !Number.isFinite(point.longitude)
      ) {
        marker.remove()
        return
      }

      const center: [number, number] = [point.longitude, point.latitude]
      marker.setLngLat(center).addTo(activeMap)
      void activeMap.flyTo({
        center,
        essential: true,
        zoom: SELECTED_POINT_ZOOM,
      })
    }

    map.on('click', (event) => {
      const point = {
        latitude: event.lngLat.lat,
        longitude: event.lngLat.lng,
      }
      onSelectPointRef.current(point)
      draftMarker.setLngLat([point.longitude, point.latitude]).addTo(map)
    })

    if (map.isStyleLoaded()) {
      applySelectedPointFromRef()
    } else {
      void map.once('load', applySelectedPointFromRef)
    }

    return () => {
      map.off('load', applySelectedPointFromRef)
      draftMarkerRef.current = null
      mapRef.current = null
      map.remove()
    }
  }, [i18n.language, mappedStops])

  useEffect(() => {
    const map = mapRef.current
    const draftMarker = draftMarkerRef.current
    if (map === null || draftMarker === null) {
      return
    }

    function applySelectedPoint() {
      const activeMap = mapRef.current
      const marker = draftMarkerRef.current
      if (activeMap === null || marker === null) {
        return
      }

      if (
        selectedPoint === null ||
        !Number.isFinite(selectedPoint.latitude) ||
        !Number.isFinite(selectedPoint.longitude)
      ) {
        marker.remove()
        return
      }

      const center: [number, number] = [
        selectedPoint.longitude,
        selectedPoint.latitude,
      ]

      marker.setLngLat(center).addTo(activeMap)
      void activeMap.flyTo({
        center,
        essential: true,
        zoom: SELECTED_POINT_ZOOM,
      })
    }

    if (map.isStyleLoaded()) {
      applySelectedPoint()
      return
    }

    void map.once('load', applySelectedPoint)
    return () => {
      map.off('load', applySelectedPoint)
    }
  }, [selectedPoint])

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

export function LocationPickerMap(props: LocationPickerMapProps) {
  if (import.meta.env.VITE_E2E === '1') {
    return (
      <LocationPickerMapE2E heightClassName={props.heightClassName ?? 'h-72'} />
    )
  }

  return <LocationPickerMapInteractive {...props} />
}
