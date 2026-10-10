import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getAppMapStyle } from '@/shared/lib/map-style'

export interface WorkspaceMapPoint {
  id: string
  label: string
  latitude: number
  longitude: number
}

interface WorkspaceMapProps {
  onSelect: (momentId: string) => void
  points: WorkspaceMapPoint[]
  selectedId: string | null
}

const COLOR = '#285943'
const COLOR_SELECTED = '#b85f42'

export function WorkspaceMap({
  onSelect,
  points,
  selectedId,
}: WorkspaceMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  })

  useEffect(() => {
    const container = containerRef.current
    const first = points[0]
    if (container === null || first === undefined) return
    const map = new maplibregl.Map({
      attributionControl: false,
      center: [first.longitude, first.latitude],
      // Wheel zoom needs Ctrl so the page stays scrollable.
      cooperativeGestures: true,
      container,
      style: getAppMapStyle(i18n.language),
      zoom: 9,
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }))
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map
    const bounds = new maplibregl.LngLatBounds()
    const created: maplibregl.Marker[] = []
    for (const point of points) {
      const el = document.createElement('button')
      el.type = 'button'
      el.ariaLabel = point.label
      el.dataset.momentId = point.id
      el.style.cssText = `width:18px;height:18px;border-radius:9999px;border:2px solid #fff;background:${COLOR};box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer;padding:0`
      el.addEventListener('click', () => {
        onSelectRef.current(point.id)
      })
      const lngLat: [number, number] = [point.longitude, point.latitude]
      bounds.extend(lngLat)
      created.push(
        new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map),
      )
    }
    if (points.length > 1) {
      map.fitBounds(bounds, { maxZoom: 14, padding: 48 })
    }
    return () => {
      created.forEach((marker) => {
        marker.remove()
      })
      map.remove()
      mapRef.current = null
    }
  }, [i18n.language, points])

  useEffect(() => {
    const markerEls =
      containerRef.current?.querySelectorAll<HTMLElement>('[data-moment-id]') ??
      []
    for (const el of markerEls) {
      const active = el.dataset.momentId === selectedId
      el.style.background = active ? COLOR_SELECTED : COLOR
      el.style.transform = active ? 'scale(1.4)' : ''
      el.style.zIndex = active ? '2' : ''
    }
    const point = points.find((p) => p.id === selectedId)
    if (point !== undefined && mapRef.current !== null) {
      mapRef.current.easeTo({ center: [point.longitude, point.latitude] })
    }
  }, [points, selectedId])

  return (
    <div
      aria-label={t('workspace.map')}
      className="h-80 overflow-hidden rounded-lg border border-border lg:h-[calc(100vh-8rem)]"
      ref={containerRef}
      role="region"
    />
  )
}
