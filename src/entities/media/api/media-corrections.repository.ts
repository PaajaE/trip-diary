import { countRpc } from '@/entities/media/api/media-trash.repository'
import {
  MAX_SHIFT_SECONDS,
  MediaLibraryError,
} from '@/entities/media/model/media-library'
import { getSupabaseClient } from '@/shared/api/supabase'

/**
 * Moves captured_at of the media by `deltaSeconds` (shift_media_time). The RPC
 * skips media without a capture time, marks the rest captured_at_source =
 * 'manual' and touches neither captured_tz nor the moment. Resolves with the
 * number of rows changed; a zero delta changes nothing.
 */
export function shiftMediaTime(
  mediaIds: readonly string[],
  deltaSeconds: number,
): Promise<number> {
  if (
    !Number.isInteger(deltaSeconds) ||
    Math.abs(deltaSeconds) > MAX_SHIFT_SECONDS
  ) {
    return Promise.reject(
      new MediaLibraryError('invalid_input', 'time shift is out of range'),
    )
  }
  return countRpc(mediaIds, (part) =>
    getSupabaseClient().rpc('shift_media_time', {
      p_delta_seconds: deltaSeconds,
      p_media_ids: part,
    }),
  )
}

/** Sets the position of the media (location_source = 'manual'). */
export function setMediaLocation(
  mediaIds: readonly string[],
  latitude: number,
  longitude: number,
): Promise<number> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return Promise.reject(
      new MediaLibraryError('invalid_input', 'coordinates are out of range'),
    )
  }
  return countRpc(mediaIds, (part) =>
    getSupabaseClient().rpc('set_media_location', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_media_ids: part,
    }),
  )
}

/** Removes the position of the media (latitude, longitude and source null). */
export function clearMediaLocation(
  mediaIds: readonly string[],
): Promise<number> {
  return countRpc(mediaIds, (part) =>
    getSupabaseClient().rpc('clear_media_location', { p_media_ids: part }),
  )
}
