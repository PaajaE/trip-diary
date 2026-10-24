import type { MediaItem } from '@/entities/media/model/media-library'

/** What an item's position was before a correction. */
export interface PreviousLocation {
  id: string
  latitude: number | null
  longitude: number | null
}

export type LocationUndoStep =
  | { ids: string[]; kind: 'clear' }
  | { ids: string[]; kind: 'set'; latitude: number; longitude: number }

export function snapshotLocations(
  items: readonly Pick<MediaItem, 'id' | 'latitude' | 'longitude'>[],
): PreviousLocation[] {
  return items.map((item) => ({
    id: item.id,
    latitude: item.latitude,
    longitude: item.longitude,
  }))
}

/**
 * Groups the snapshot by previous coordinates so Undo needs one call per
 * distinct position: items that had none are cleared, the others get their
 * old coordinates back.
 *
 * Known limitation: set_media_location always writes location_source =
 * 'manual', so an undo restores the coordinates but cannot restore the old
 * source (e.g. 'exif'). Same for a time shift, whose undo is the inverse shift
 * and leaves captured_at_source = 'manual'.
 */
export function planLocationUndo(
  previous: readonly PreviousLocation[],
): LocationUndoStep[] {
  const cleared: string[] = []
  const groups = new Map<
    string,
    { ids: string[]; latitude: number; longitude: number }
  >()
  for (const entry of previous) {
    const { latitude, longitude } = entry
    if (latitude === null || longitude === null) {
      cleared.push(entry.id)
      continue
    }
    const key = `${String(latitude)},${String(longitude)}`
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, { ids: [entry.id], latitude, longitude })
    } else {
      group.ids.push(entry.id)
    }
  }
  const steps: LocationUndoStep[] = []
  if (cleared.length > 0) steps.push({ ids: cleared, kind: 'clear' })
  for (const group of groups.values()) steps.push({ ...group, kind: 'set' })
  return steps
}
