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

const PRIMARY_MARKER_ID = '__moment-primary__'

export function MomentPhotoMap({
  activePhotoId = null,
  className,
  onSelectPhoto,
  photos,
  primaryLocation = null,
  thumbUrls = {},
}: MomentPhotoMapProps) {
  const { i18n, t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const userMovedRef = useRef(false)
  const onSelectPhotoRef = useRef(onSelectPhoto)
  const [ready, setReady] = useState(false)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    onSelectPhotoRef.current = onSelectPhoto
  }, [onSelectPhoto])

  const geotagged = useMemo(
    () =>
      photos.filter(
        (photo) => photo.latitude !== null && photo.longitude !== null,
      ),
    [photos],
  )

  const camera = useMemo(() => computePhotoMapCamera(geotagged), [geotagged])
  const mapMountKey = camera === null ? 'none' : 'map'
  const cameraRef = useRef(camera)

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
    if (mapMountKey === 'none') {
      return
    }

    const container = containerRef.current
    const initialCamera = cameraRef.current
    if (container === null || initialCamera === null) {
      return
    }

    setInitError(null)
    userMovedRef.current = false
    const markers = markersRef.current

    let map: maplibregl.Map
    try {
      map = new maplibregl.Map({
        attributionControl: { compact: true },
        container,
        style: getAppMapStyle(i18n.language),
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
    } catch {
      const message = t('reader.mapInitError')
      queueMicrotask(() => {
        setInitError(message)
      })
      return
    }

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    )
    mapRef.current = map

    const finishReady = () => {
      map.resize()
      setReady(true)
    }

    const onDrag = () => {
      userMovedRef.current = true
    }

    if (map.loaded()) {
      finishReady()
    } else {
      void map.once('load', finishReady)
    }
    map.on('dragstart', onDrag)
    map.on('zoomstart', onDrag)

    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        map.resize()
      }
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      map.off('dragstart', onDrag)
      map.off('zoomstart', onDrag)
      for (const marker of markers.values()) {
        marker.remove()
      }
      markers.clear()
      mapRef.current = null
      setReady(false)
      try {
        map.remove()
      } catch {
        // MapLibre may throw if already removed during Strict Mode remounts.
      }
    }
  }, [i18n.language, mapMountKey, t])

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
      const marker = new maplibregl.Marker({ element: primary })
        .setLngLat([primaryLocation.longitude, primaryLocation.latitude])
        .addTo(map)
      markers.set(PRIMARY_MARKER_ID, marker)
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
        onSelectPhotoRef.current(photo.id)
      })
      const marker = new maplibregl.Marker({ element: button })
        .setLngLat([photo.longitude, photo.latitude])
        .addTo(map)
      markers.set(photo.id, marker)
    }
  }, [activePhotoId, geotagged, primaryLocation, ready, t, thumbUrls])

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
      {initError !== null ? (
        <p
          className="mt-4 rounded-[1.5rem] border border-border bg-surface px-4 py-6 text-sm text-muted"
          role="alert"
        >
          {t('reader.mapInitError')}
        </p>
      ) : (
        <div className="reader-map-frame reader-map-frame--moment mt-4 overflow-hidden rounded-[1.5rem] border border-border shadow-soft">
          <div className="moment-photo-map-canvas" ref={containerRef} />
        </div>
      )}
    </section>
  )
}
