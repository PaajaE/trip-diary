import { computePhotoMapCamera } from '@trip-diary/utils'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MomentPhotoMeta } from '@/entities/photo/api/moment-photo-detail.repository'
import { getAppMapStyle } from '@/shared/lib/map-style'

interface MomentPhotoMapProps {
  activePhotoId?: string | null
  className?: string
  onSelectPhoto: (photoId: string) => void
  photos: MomentPhotoMeta[]
  primaryLocation?: { latitude: number; longitude: number } | null
  thumbUrls?: Record<string, string>
}

export function MomentPhotoMap({
  activePhotoId = null,
  className,
  onSelectPhoto,
  photos,
  primaryLocation = null,
  thumbUrls = {},
}: MomentPhotoMapProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const userMovedRef = useRef(false)
  const cameraRef = useRef<ReturnType<typeof computePhotoMapCamera>>(null)
  const [ready, setReady] = useState(false)

  const geotagged = useMemo(
    () =>
      photos.filter(
        (photo) => photo.latitude !== null && photo.longitude !== null,
      ),
    [photos],
  )

  const camera = useMemo(
    () => computePhotoMapCamera(geotagged),
    [geotagged],
  )

  const mapMountKey = camera === null ? 'none' : 'map'

  const geotaggedKey = useMemo(
    () =>
      geotagged
        .map(
          (photo) =>
            `${photo.id}:${String(photo.latitude)}:${String(photo.longitude)}`,
        )
        .join('|'),
    [geotagged],
  )

  useEffect(() => {
    cameraRef.current = camera
  }, [camera])

  useEffect(() => {
    const initialCamera = cameraRef.current
    if (initialCamera === null || containerRef.current === null) {
      return
    }

    const markers = markersRef.current
    const map = new maplibregl.Map({
      attributionControl: { compact: true },
      container: containerRef.current,
      style: getAppMapStyle(),
      ...(initialCamera.type === 'center'
        ? {
            center: [
              initialCamera.center.longitude,
              initialCamera.center.latitude,
            ],
            zoom: initialCamera.zoomLevel,
          }
        : {
            bounds: [initialCamera.sw, initialCamera.ne],
            fitBoundsOptions: {
              maxZoom: initialCamera.maxZoomLevel,
              padding: initialCamera.padding,
            },
          }),
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    const onLoad = () => {
      setReady(true)
      map.resize()
    }
    const onDrag = () => {
      userMovedRef.current = true
    }
    map.on('load', onLoad)
    map.on('dragstart', onDrag)
    map.on('zoomstart', onDrag)

    return () => {
      map.off('load', onLoad)
      map.off('dragstart', onDrag)
      map.off('zoomstart', onDrag)
      for (const marker of markers.values()) {
        marker.remove()
      }
      markers.clear()
      map.remove()
      mapRef.current = null
      setReady(false)
      userMovedRef.current = false
    }
  }, [mapMountKey])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || map === null || camera === null || userMovedRef.current) {
      return
    }

    map.resize()
    if (camera.type === 'center') {
      map.easeTo({
        center: [camera.center.longitude, camera.center.latitude],
        duration: 0,
        zoom: camera.zoomLevel,
      })
      return
    }

    map.fitBounds([camera.sw, camera.ne], {
      duration: 0,
      maxZoom: camera.maxZoomLevel,
      padding: camera.padding,
    })
  }, [camera, geotaggedKey, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || map === null) {
      return
    }

    const markers = markersRef.current
    for (const marker of markers.values()) {
      marker.remove()
    }
    markers.clear()

    if (primaryLocation !== null) {
      const primary = document.createElement('button')
      primary.type = 'button'
      primary.className = 'moment-map-primary-marker'
      primary.setAttribute('aria-label', t('reader.momentPrimaryLocation'))
      new maplibregl.Marker({ element: primary })
        .setLngLat([primaryLocation.longitude, primaryLocation.latitude])
        .addTo(map)
    }

    for (const photo of geotagged) {
      if (photo.latitude === null || photo.longitude === null) {
        continue
      }
      const button = document.createElement('button')
      button.type = 'button'
      button.className =
        photo.id === activePhotoId
          ? 'moment-map-photo-marker moment-map-photo-marker--active'
          : 'moment-map-photo-marker'
      const caption = photo.caption?.trim()
      button.setAttribute(
        'aria-label',
        caption !== undefined && caption.length > 0
          ? caption
          : t('reader.openPhotoOnMap'),
      )
      const thumbUrl = thumbUrls[photo.id]
      if (thumbUrl !== undefined) {
        const img = document.createElement('img')
        img.src = thumbUrl
        img.alt = ''
        img.decoding = 'async'
        button.append(img)
      }
      button.addEventListener('click', () => {
        onSelectPhoto(photo.id)
      })
      const marker = new maplibregl.Marker({ element: button })
        .setLngLat([photo.longitude, photo.latitude])
        .addTo(map)
      markers.set(photo.id, marker)
    }
  }, [activePhotoId, geotagged, onSelectPhoto, primaryLocation, ready, t, thumbUrls])

  if (camera === null || geotagged.length === 0) {
    return null
  }

  return (
    <section
      aria-label={t('reader.photosOnMap')}
      className={className ?? 'mt-12'}
    >
      <h2 className="reader-display text-2xl tracking-[-0.03em]">
        {t('reader.photosOnMap')}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {t('reader.photosOnMapHint', { count: geotagged.length })}
      </p>
      <div className="reader-map-frame mt-4 overflow-hidden rounded-[1.5rem] border border-border shadow-soft">
        <div className="h-[min(22rem,55vw)] w-full" ref={containerRef} />
      </div>
    </section>
  )
}
