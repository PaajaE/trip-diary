import { Capacitor, registerPlugin } from '@capacitor/core'
import { isMeaningfulGpsCoordinate } from '@/entities/photo/lib/photo-exif-gps'
import type { PhotoMetadataOverride } from '@/entities/photo/lib/process-photo'

interface MaterializedNativePhoto {
  capturedAt?: string
  latitude?: number
  longitude?: number
  mimeType?: string
  path?: string
  webPath: string
}

interface PhotoMetadataPlugin {
  materializePhotoFromUri(options: { uri: string }): Promise<MaterializedNativePhoto>
  readGpsFromUri(options: { uri: string }): Promise<{
    latitude?: number
    longitude?: number
  }>
  requestMediaPermissions(): Promise<{
    accessMediaLocation: string
  }>
}

const PhotoMetadata = registerPlugin<PhotoMetadataPlugin>('PhotoMetadata')

function isNativePhotoPlatform() {
  if (!Capacitor.isNativePlatform()) {
    return false
  }

  const platform = Capacitor.getPlatform()
  return platform === 'android' || platform === 'ios'
}

export async function requestNativePhotoPermissions() {
  if (!isNativePhotoPlatform()) {
    return null
  }

  return PhotoMetadata.requestMediaPermissions()
}

export async function materializeNativePhoto(uri: string) {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isNativePlatform()) {
    throw new Error('Native photo materialization is only available on Android')
  }

  return PhotoMetadata.materializePhotoFromUri({ uri })
}

export async function readNativePhotoGps(uri: string | undefined) {
  if (uri === undefined || uri === '' || !isNativePhotoPlatform()) {
    return null
  }

  try {
    const result = await PhotoMetadata.readGpsFromUri({ uri })
    if (
      !isMeaningfulGpsCoordinate(result.latitude, result.longitude) ||
      result.latitude === undefined ||
      result.longitude === undefined
    ) {
      return null
    }

    return {
      latitude: result.latitude,
      longitude: result.longitude,
    }
  } catch {
    return null
  }
}

export function readMaterializedPhotoMetadata(
  materialized: MaterializedNativePhoto,
): PhotoMetadataOverride {
  return {
    ...(materialized.capturedAt === undefined
      ? {}
      : { capturedAt: materialized.capturedAt }),
    ...(isMeaningfulGpsCoordinate(
      materialized.latitude,
      materialized.longitude,
    )
      ? {
          latitude: materialized.latitude as number,
          longitude: materialized.longitude as number,
        }
      : {}),
  }
}
