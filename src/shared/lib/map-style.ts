import { resolveMapStyle, isMapyApiKeyConfigured } from '@trip-diary/maps'
import type { ResolvedMapStyle } from '@trip-diary/maps'
import type { StyleSpecification } from 'maplibre-gl'
import { publicEnv } from '@/shared/config/env'

export function isMapyBasemapEnabled(): boolean {
  return isMapyApiKeyConfigured(publicEnv.mapyApiKey)
}

export function getAppMapStyle(language?: string): StyleSpecification {
  return resolveMapStyle({
    apiKey: publicEnv.mapyApiKey,
    language,
  }).style
}

export function getResolvedAppMapStyle(language?: string): ResolvedMapStyle {
  return resolveMapStyle({
    apiKey: publicEnv.mapyApiKey,
    language,
  })
}
