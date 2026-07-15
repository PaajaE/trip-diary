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
import { computeJourneyStopMapCamera } from '@trip-diary/utils'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StyleSheet, Text, View } from 'react-native'
import { toMappableJourneyStops } from '@/features/journeys/lib/journey-map-stops'
import { mobilePublicEnv } from '@/platform/env'
import { colors, spacing } from '@/foundation/theme'

const DEFAULT_CENTER = { latitude: 50.0755, longitude: 14.4378 }
const SELECTED_ZOOM = 13

interface LocationPickerMapProps {
  onSelectPoint: (point: { latitude: number; longitude: number }) => void
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
  onSelectPoint,
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
  const journeyCamera = useMemo(
    () => computeJourneyStopMapCamera(mappableStops),
    [mappableStops],
  )

  const initialCenter = useMemo(() => {
    if (selectedPoint !== null) {
      return selectedPoint
    }

    if (mappableStops.length > 0) {
      return {
        latitude: mappableStops[0].latitude,
        longitude: mappableStops[0].longitude,
      }
    }

    return DEFAULT_CENTER
  }, [mappableStops, selectedPoint])

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

  return (
    <View style={styles.container}>
      <MapView
        attributionEnabled
        mapStyle={resolved.style}
        onDidFailLoadingMap={applyRuntimeOsmFallback}
        onPress={(feature) => {
          const point = readPointFromFeature(feature)
          if (point !== null) {
            onSelectPoint(point)
          }
        }}
        style={styles.map}
      >
        {selectedPoint !== null ? (
          <Camera
            animationDuration={200}
            centerCoordinate={[selectedPoint.longitude, selectedPoint.latitude]}
            zoomLevel={SELECTED_ZOOM}
          />
        ) : journeyCamera?.type === 'bounds' ? (
          <Camera
            animationDuration={0}
            bounds={{
              ne: journeyCamera.ne,
              paddingBottom: journeyCamera.padding,
              paddingLeft: journeyCamera.padding,
              paddingRight: journeyCamera.padding,
              paddingTop: journeyCamera.padding,
              sw: journeyCamera.sw,
            }}
            maxZoomLevel={journeyCamera.maxZoomLevel}
          />
        ) : journeyCamera?.type === 'center' ? (
          <Camera
            animationDuration={0}
            centerCoordinate={[
              journeyCamera.center.longitude,
              journeyCamera.center.latitude,
            ]}
            zoomLevel={journeyCamera.zoomLevel}
          />
        ) : (
          <Camera
            animationDuration={0}
            centerCoordinate={[initialCenter.longitude, initialCenter.latitude]}
            zoomLevel={mappableStops.length > 0 ? 8 : 5}
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
  selectedMarker: {
    backgroundColor: '#b85f42',
    borderColor: '#ffffff',
    borderRadius: 9,
    borderWidth: 2,
    height: 18,
    width: 18,
  },
})
