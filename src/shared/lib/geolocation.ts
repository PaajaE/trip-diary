import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export interface DevicePosition {
  latitude: number
  longitude: number
}

export async function getCurrentDevicePosition(options?: {
  enableHighAccuracy?: boolean
  maximumAge?: number
  timeout?: number
}): Promise<DevicePosition> {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.checkPermissions()
    if (
      permission.location !== 'granted' &&
      permission.coarseLocation !== 'granted'
    ) {
      const requested = await Geolocation.requestPermissions()
      if (
        requested.location !== 'granted' &&
        requested.coarseLocation !== 'granted'
      ) {
        throw new Error('Location permission denied')
      }
    }

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      maximumAge: options?.maximumAge ?? 120_000,
      timeout: options?.timeout ?? 12_000,
    })

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    }
  }

  if (!('geolocation' in navigator)) {
    throw new Error('Geolocation unavailable')
  }

  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      maximumAge: options?.maximumAge ?? 120_000,
      timeout: options?.timeout ?? 12_000,
    })
  })

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  }
}

export function isGeolocationAvailable() {
  return Capacitor.isNativePlatform() || 'geolocation' in navigator
}
