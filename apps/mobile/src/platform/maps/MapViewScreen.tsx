import {
  Camera,
  MapView,
  PointAnnotation,
} from '@maplibre/maplibre-react-native'
import {
  buildStyleForProvider,
  getNextFallbackProvider,
  resolveMapStyle,
} from '@trip-diary/maps'
import type { JourneyMapCamera } from '@trip-diary/utils'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { mobilePublicEnv } from '@/platform/env'
import { getCurrentLocation } from '@/platform/media/photo'
import { shouldRequestDeviceLocation } from '@/platform/maps/map-view-screen.logic'

const DEFAULT_DEVICE_ZOOM = 10
const LOCATION_TIMEOUT_MS = 8000

export interface MapStopMarker {
  accessibilityLabel: string
  id: string
  latitude: number
  longitude: number
  status: 'planned' | 'visited'
  title: string
}

export interface MapPhotoMarker {
  accessibilityLabel: string
  id: string
  latitude: number
  longitude: number
  title: string
}

interface MapCoordinate {
  latitude: number
  longitude: number
}

interface MapViewScreenProps {
  camera?: JourneyMapCamera | null
  latitude?: number
  longitude?: number
  markers?: MapStopMarker[]
  photoMarkers?: MapPhotoMarker[]
  useDeviceLocationFallback?: boolean
}

function toMapCoordinate(
  latitude: number | undefined,
  longitude: number | undefined,
): MapCoordinate | null {
  if (
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    return { latitude, longitude }
  }

  return null
}

async function resolveDeviceMapCenter(): Promise<MapCoordinate | null> {
  return Promise.race([
    getCurrentLocation(),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)
    }),
  ])
}

function JourneyStopMarkerView({
  status,
}: {
  status: MapStopMarker['status']
}) {
  if (status === 'visited') {
    return (
      <View style={styles.markerVisitedOuter}>
        <View style={styles.markerVisitedInner} />
      </View>
    )
  }

  return <View style={styles.markerPlanned} />
}

function JourneyPhotoMarkerView() {
  return <View style={styles.markerPhoto} />
}

export function MapViewScreen({
  camera = null,
  latitude: propLatitude,
  longitude: propLongitude,
  markers = [],
  photoMarkers = [],
  useDeviceLocationFallback = false,
}: MapViewScreenProps = {}) {
  const mapConfig = useMemo(
    () => ({
      apiKey: mobilePublicEnv.mapyApiKey,
      defaultProvider: 'mapy-tourist' as const,
      language: 'cs',
    }),
    [],
  )

  const [resolved, setResolved] = useState(() => resolveMapStyle(mapConfig))
  const [runtimeFallbackAttempted, setRuntimeFallbackAttempted] =
    useState(false)
  const [deviceCenter, setDeviceCenter] = useState<MapCoordinate | null>(null)

  const journeyMode = camera !== null || markers.length > 0 || photoMarkers.length > 0
  const shouldUseDeviceLocation = shouldRequestDeviceLocation({
    journeyMode,
    propCenterAvailable: toMapCoordinate(propLatitude, propLongitude) !== null,
    useDeviceLocationFallback,
  })

  useEffect(() => {
    if (!shouldUseDeviceLocation) {
      setDeviceCenter(null)
      return
    }

    let cancelled = false

    void resolveDeviceMapCenter().then((center) => {
      if (cancelled || center === null) {
        if (__DEV__ && !cancelled) {
          console.log('[MapViewScreen] no device map center')
        }
        return
      }

      setDeviceCenter(center)
      if (__DEV__) {
        console.log(
          `[MapViewScreen] device map center: ${String(center.latitude)}, ${String(center.longitude)}`,
        )
      }
    })

    return () => {
      cancelled = true
    }
  }, [shouldUseDeviceLocation])

  useEffect(() => {
    if (__DEV__) {
      console.log(
        `[MapViewScreen] provider=${resolved.providerId} reason=${resolved.reason}`,
      )
    }
  }, [resolved.providerId, resolved.reason])

  const applyRuntimeOsmFallback = useCallback(() => {
    if (runtimeFallbackAttempted || resolved.providerId === 'osm') {
      return
    }

    const nextProvider = getNextFallbackProvider(resolved.providerId, mapConfig)
    if (nextProvider !== 'osm') {
      return
    }

    const fallback = buildStyleForProvider('osm', mapConfig)
    if (fallback === null) {
      return
    }

    setRuntimeFallbackAttempted(true)
    setResolved({ ...fallback, reason: 'fallback-runtime' })
    if (__DEV__) {
      console.log('[MapViewScreen] runtime fallback → osm')
    }
  }, [mapConfig, resolved.providerId, runtimeFallbackAttempted])

  const propCenter = toMapCoordinate(propLatitude, propLongitude)
  const fallbackCenter = propCenter ?? deviceCenter

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        mapStyle={resolved.style}
        attributionEnabled
        onDidFailLoadingMap={applyRuntimeOsmFallback}
      >
        {camera?.type === 'center' ? (
          <Camera
            animationDuration={0}
            centerCoordinate={[camera.center.longitude, camera.center.latitude]}
            zoomLevel={camera.zoomLevel}
          />
        ) : null}

        {camera?.type === 'bounds' ? (
          <Camera
            animationDuration={0}
            bounds={{
              ne: camera.ne,
              paddingBottom: camera.padding,
              paddingLeft: camera.padding,
              paddingRight: camera.padding,
              paddingTop: camera.padding,
              sw: camera.sw,
            }}
            maxZoomLevel={camera.maxZoomLevel}
          />
        ) : null}

        {!journeyMode && fallbackCenter !== null ? (
          <>
            <Camera
              animationDuration={0}
              centerCoordinate={[
                fallbackCenter.longitude,
                fallbackCenter.latitude,
              ]}
              zoomLevel={DEFAULT_DEVICE_ZOOM}
            />
            <PointAnnotation
              coordinate={[fallbackCenter.longitude, fallbackCenter.latitude]}
              id="device-location"
            >
              <View style={styles.markerVisitedOuter}>
                <View style={styles.markerVisitedInner} />
              </View>
            </PointAnnotation>
          </>
        ) : null}

        {markers.map((marker) => (
          <PointAnnotation
            key={marker.id}
            coordinate={[marker.longitude, marker.latitude]}
            id={`journey-stop-${marker.id}`}
            title={marker.title}
          >
            <View
              accessibilityLabel={marker.accessibilityLabel}
              accessibilityRole="image"
            >
              <JourneyStopMarkerView status={marker.status} />
            </View>
          </PointAnnotation>
        ))}

        {photoMarkers.map((marker) => (
          <PointAnnotation
            key={`photo-${marker.id}`}
            coordinate={[marker.longitude, marker.latitude]}
            id={`journey-photo-${marker.id}`}
            title={marker.title}
          >
            <View
              accessibilityLabel={marker.accessibilityLabel}
              accessibilityRole="image"
            >
              <JourneyPhotoMarkerView />
            </View>
          </PointAnnotation>
        ))}
      </MapView>
      <View style={styles.attribution}>
        <Text style={styles.attributionText}>
          {resolved.providerId} · {resolved.attribution}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  attribution: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    bottom: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 8,
  },
  attributionText: {
    color: '#5c6358',
    fontSize: 11,
  },
  container: {
    borderRadius: 12,
    flex: 1,
    minHeight: 240,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  markerPlanned: {
    backgroundColor: '#ffffff',
    borderColor: '#3d6b4f',
    borderRadius: 8,
    borderWidth: 3,
    height: 16,
    width: 16,
  },
  markerPhoto: {
    backgroundColor: '#c45c26',
    borderColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 2,
    height: 14,
    width: 14,
  },
  markerVisitedInner: {
    backgroundColor: '#ffffff',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  markerVisitedOuter: {
    alignItems: 'center',
    backgroundColor: '#3d6b4f',
    borderColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    justifyContent: 'center',
    width: 16,
  },
})
