import exifr from 'exifr'
import { isMeaningfulGpsCoordinate } from '@/entities/photo/lib/photo-exif-gps'

export interface ExtractedPhotoGps {
  latitude: number
  longitude: number
}

export async function extractGpsFromBlob(
  blob: Blob,
): Promise<ExtractedPhotoGps | null> {
  const buffer = await blob.arrayBuffer()
  const gps = await exifr.gps(buffer).catch(() => undefined)
  if (
    gps === undefined ||
    !isMeaningfulGpsCoordinate(gps.latitude, gps.longitude)
  ) {
    return null
  }

  return {
    latitude: gps.latitude,
    longitude: gps.longitude,
  }
}
