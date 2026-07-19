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
import type { JourneyStop } from '@trip-diary/core/journey'
import { computePhotoMapCamera } from '@trip-diary/utils'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { toMappableJourneyStops } from '@/features/journeys/lib/journey-map-stops'
import { mobilePublicEnv } from '@/platform/env'
import { colors, spacing } from '@/foundation/theme'

const DEFAULT_CENTER = { latitude: 50.0755, longitude: 14.4378 }
const SELECTED_ZOOM = 13

export interface LocationPickerPhotoMarker {
  id: string
  latitude: number
  longitude: number
  title?: string
}

interface LocationPickerMapProps {
  onSelectPhotoMarker?: (photoId: string) => void
  onSelectPoint: (point: { latitude: number; longitude: number }) => void
  photoMarkers?: LocationPickerPhotoMarker[]
  selectedPoint: { latitude: number; longitude: number } | null
  stops: JourneyStop[]
}

function readPointFromFeature(
  feature: GeoJSON.Feature,
): { latitude: number; longitude: number } | null {
  const geometry = feature.geometry
  if (geometry.type !== 'Point') {
    return null
  }

  const [longitude, latitude] = geometry.coordinates
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null
  }

  return { latitude, longitude }
}

export function LocationPickerMap({
  onSelectPhotoMarker,
  onSelectPoint,
  photoMarkers = [],
  selectedPoint,
  stops,
}: LocationPickerMapProps) {
  const { t } = useTranslation()
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

  const mappableStops = useMemo(() => toMappableJourneyStops(stops), [stops])
  const userMovedRef = useRef(false)
  const contentCamera = useMemo(
    () =>
      computePhotoMapCamera([
        ...mappableStops.map((stop) => ({
          latitude: stop.latitude,
          longitude: stop.longitude,
        })),
        ...photoMarkers.map((photo) => ({
          id: photo.id,
          latitude: photo.latitude,
          longitude: photo.longitude,
        })),
      ]),
    [mappableStops, photoMarkers],
  )

  const photoKey = useMemo(
    () =>
      photoMarkers
        .map(
          (photo) =>
            `${photo.id}:${String(photo.latitude)}:${String(photo.longitude)}`,
        )
        .join('|'),
    [photoMarkers],
  )

  useEffect(() => {
    userMovedRef.current = false
  }, [photoKey])

  const initialCenter = useMemo(() => {
    if (selectedPoint !== null) {
      return selectedPoint
    }

    if (photoMarkers.length > 0) {
      return {
        latitude: photoMarkers[0].latitude,
        longitude: photoMarkers[0].longitude,
      }
    }

    if (mappableStops.length > 0) {
      return {
        latitude: mappableStops[0].latitude,
        longitude: mappableStops[0].longitude,
      }
    }

    return DEFAULT_CENTER
  }, [mappableStops, photoMarkers, selectedPoint])

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
  }, [mapConfig, resolved.providerId, runtimeFallbackAttempted])

  useEffect(() => {
    if (__DEV__) {
      console.log(
        `[LocationPickerMap] provider=${resolved.providerId} reason=${resolved.reason}`,
      )
    }
  }, [resolved.providerId, resolved.reason])

  const fitPhotoBounds =
    !userMovedRef.current &&
    (photoMarkers.length > 1 ||
      (photoMarkers.length > 0 && mappableStops.length > 0))

  return (
    <View style={styles.container}>
      <MapView
        attributionEnabled
        mapStyle={resolved.style}
        onDidFailLoadingMap={applyRuntimeOsmFallback}
        onRegionDidChange={() => {
          userMovedRef.current = true
        }}
        onPress={(feature) => {
          const point = readPointFromFeature(feature)
          if (point !== null) {
            onSelectPoint(point)
          }
        }}
        style={styles.map}
      >
        {fitPhotoBounds && contentCamera?.type === 'bounds' ? (
          <Camera
            animationDuration={200}
            bounds={{
              ne: contentCamera.ne,
              paddingBottom: contentCamera.padding,
              paddingLeft: contentCamera.padding,
              paddingRight: contentCamera.padding,
              paddingTop: contentCamera.padding,
              sw: contentCamera.sw,
            }}
            maxZoomLevel={contentCamera.maxZoomLevel}
          />
        ) : contentCamera?.type === 'center' && photoMarkers.length > 0 ? (
          <Camera
            animationDuration={200}
            centerCoordinate={[
              contentCamera.center.longitude,
              contentCamera.center.latitude,
            ]}
            zoomLevel={contentCamera.zoomLevel}
          />
        ) : selectedPoint !== null ? (
          <Camera
            animationDuration={200}
            centerCoordinate={[selectedPoint.longitude, selectedPoint.latitude]}
            zoomLevel={SELECTED_ZOOM}
          />
        ) : contentCamera?.type === 'bounds' ? (
          <Camera
            animationDuration={0}
            bounds={{
              ne: contentCamera.ne,
              paddingBottom: contentCamera.padding,
              paddingLeft: contentCamera.padding,
              paddingRight: contentCamera.padding,
              paddingTop: contentCamera.padding,
              sw: contentCamera.sw,
            }}
            maxZoomLevel={contentCamera.maxZoomLevel}
          />
        ) : contentCamera?.type === 'center' ? (
          <Camera
            animationDuration={0}
            centerCoordinate={[
              contentCamera.center.longitude,
              contentCamera.center.latitude,
            ]}
            zoomLevel={contentCamera.zoomLevel}
          />
        ) : (
          <Camera
            animationDuration={0}
            centerCoordinate={[initialCenter.longitude, initialCenter.latitude]}
            zoomLevel={mappableStops.length > 0 || photoMarkers.length > 0 ? 8 : 5}
          />
        )}

        {mappableStops.map((stop) => (
          <PointAnnotation
            coordinate={[stop.longitude, stop.latitude]}
            id={`picker-stop-${stop.id}`}
            key={stop.id}
          >
            <View style={styles.existingStopMarker} />
          </PointAnnotation>
        ))}

        {photoMarkers.map((photo) => (
          <PointAnnotation
            coordinate={[photo.longitude, photo.latitude]}
            id={`picker-photo-${photo.id}`}
            key={photo.id}
            onSelected={() => {
              onSelectPoint({
                latitude: photo.latitude,
                longitude: photo.longitude,
              })
              onSelectPhotoMarker?.(photo.id)
            }}
            title={photo.title}
          >
            <View
              accessibilityLabel={
                photo.title ?? t('entry.photoHasGps')
              }
              style={styles.photoMarker}
            />
          </PointAnnotation>
        ))}

        {selectedPoint !== null ? (
          <PointAnnotation
            coordinate={[selectedPoint.longitude, selectedPoint.latitude]}
            id="picker-selected-point"
          >
            <View style={styles.selectedMarker} />
          </PointAnnotation>
        ) : null}
      </MapView>
      <Text style={styles.help}>{t('journey.mapPickerHelp')}</Text>
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
    color: colors.textMuted,
    fontSize: 11,
  },
  container: {
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    height: 240,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  existingStopMarker: {
    backgroundColor: '#3d6b4f',
    borderColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 2,
    height: 14,
    width: 14,
  },
  help: {
    backgroundColor: colors.surface,
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  map: {
    flex: 1,
    minHeight: 200,
  },
  photoMarker: {
    backgroundColor: '#2f6fed',
    borderColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 2,
    height: 14,
    width: 14,
  },
  selectedMarker: {
    backgroundColor: '#b85f42',
    borderColor: '#ffffff',
    borderRadius: 9,
    borderWidth: 2,
    height: 18,
    width: 18,
  },
})
