/**
 * One sorting session over the day model (day-sort): the state of every
 * photo after the optimistic steps of the session, where to go next, and
 * the series of a photo. A photo trashed in this session is no longer in the
 * tree; the session keeps it in its stop (faded, "koš") so the filmstrip
 * does not jump. Pure: no React, no I/O.
 */
import type { MediaItem } from '@/entities/media/model/media-library'
import {
  byCapture,
  type FlowStop,
} from '@/features/journey-flow/model/flow-days'
import type {
  DaySortModel,
  SortPhoto,
  SortStop,
} from '@/features/journey-flow/model/day-sort'
import type { SortOutcome } from '@/features/media-batch/model/quick-sort'

/** keep = sorted (kept), trash = in the trash, open = still to decide. */
export type PhotoState = 'keep' | 'open' | 'trash'

export interface SessionPhoto extends SortPhoto {
  state: PhotoState
}

export interface SessionStop {
  done: boolean
  /** 1-based position among the day's sortable stops ("5 · Mistaya"). */
  number: number
  photos: SessionPhoto[]
  /** Kept or trashed so far. */
  sorted: number
  stop: FlowStop
  total: number
}

export interface SessionView {
  doneStops: number
  stops: SessionStop[]
  totalStops: number
}

/** A photo trashed in this session, with the stop it was in. */
export interface TrashedPhoto {
  item: MediaItem
  stopId: string
}

export interface PhotoRef {
  photoId: string
  stopId: string
}

export function photoState(
  photo: Pick<SortPhoto, 'item' | 'reviewed'>,
  handled: ReadonlyMap<string, SortOutcome>,
): PhotoState {
  const outcome = handled.get(photo.item.id)
  if (outcome === 'trash') return 'trash'
  if (outcome !== undefined || photo.reviewed) return 'keep'
  return 'open'
}

function sessionStop(
  stop: SortStop,
  number: number,
  handled: ReadonlyMap<string, SortOutcome>,
  trashed: readonly TrashedPhoto[],
): SessionStop {
  const live = new Set(stop.photos.map((photo) => photo.item.id))
  const gone: SortPhoto[] = trashed
    .filter(
      (entry) =>
        entry.stopId === stop.stop.id &&
        !live.has(entry.item.id) &&
        handled.get(entry.item.id) === 'trash',
    )
    .map((entry) => ({
      item: entry.item,
      recommended: false,
      reviewed: false,
      seriesIds: [],
      trashHint: null,
    }))
  const photos = [...stop.photos, ...gone]
    .sort((a, b) => byCapture(a.item, b.item))
    .map((photo) => ({ ...photo, state: photoState(photo, handled) }))
  const sorted = photos.filter((photo) => photo.state !== 'open').length
  return {
    done: sorted === photos.length,
    number,
    photos,
    sorted,
    stop: stop.stop,
    total: photos.length,
  }
}

/** The day model with the session's steps applied. */
export function buildSessionView(
  model: DaySortModel,
  handled: ReadonlyMap<string, SortOutcome>,
  trashed: readonly TrashedPhoto[] = [],
): SessionView {
  const stops = model.stops.map((stop, index) =>
    sessionStop(stop, index + 1, handled, trashed),
  )
  return {
    doneStops: stops.filter((stop) => stop.done).length,
    stops,
    totalStops: stops.length,
  }
}

/** The first photo still to decide, in day order; null when the day is done. */
export function firstOpen(view: SessionView): PhotoRef | null {
  for (const stop of view.stops) {
    const open = stop.photos.find((photo) => photo.state === 'open')
    if (open !== undefined) {
      return { photoId: open.item.id, stopId: stop.stop.id }
    }
  }
  return null
}

/**
 * Automatic advance after deciding `from`: the next open photo of the same
 * stop (wrapping inside the stop), else the first open photo of a later
 * stop, else of an earlier one; null when everything is decided.
 */
export function nextOpen(view: SessionView, from: PhotoRef): PhotoRef | null {
  const at = view.stops.findIndex((stop) => stop.stop.id === from.stopId)
  const stop = view.stops[at]
  if (stop !== undefined) {
    const index = stop.photos.findIndex((p) => p.item.id === from.photoId)
    const ordered = [
      ...stop.photos.slice(index + 1),
      ...stop.photos.slice(0, Math.max(0, index)),
    ]
    const open = ordered.find(
      (photo) => photo.state === 'open' && photo.item.id !== from.photoId,
    )
    if (open !== undefined) {
      return { photoId: open.item.id, stopId: stop.stop.id }
    }
  }
  const order = [
    ...view.stops.slice(at + 1),
    ...view.stops.slice(0, Math.max(0, at)),
  ]
  for (const other of order) {
    const open = other.photos.find((photo) => photo.state === 'open')
    if (open !== undefined) {
      return { photoId: open.item.id, stopId: other.stop.id }
    }
  }
  return null
}

/** Where a photo is in the view ("3 z 9"), null when it is gone. */
export function locate(
  view: SessionView,
  ref: PhotoRef | null,
): { index: number; photo: SessionPhoto; stop: SessionStop } | null {
  if (ref === null) return null
  for (const stop of view.stops) {
    const index = stop.photos.findIndex((p) => p.item.id === ref.photoId)
    const photo = stop.photos[index]
    if (photo !== undefined) return { index, photo, stop }
  }
  return null
}

/**
 * The series of a photo for "Podobné: N": its similar shots still in the
 * day and not trashed, in capture order. Empty when it has no series.
 */
export function seriesOf(view: SessionView, photoId: string): SessionPhoto[] {
  const all = view.stops.flatMap((stop) => stop.photos)
  const self = all.find((photo) => photo.item.id === photoId)
  if (self === undefined || self.seriesIds.length < 2) return []
  const ids = new Set(self.seriesIds)
  const out = all.filter(
    (photo) => ids.has(photo.item.id) && photo.state !== 'trash',
  )
  return out.length >= 2 ? out : []
}

/** Ids decided in the session or before (the `sortedNow` of finishStop). */
export function sortedIds(view: SessionView): Set<string> {
  return new Set(
    view.stops.flatMap((stop) =>
      stop.photos
        .filter((photo) => photo.state !== 'open')
        .map((photo) => photo.item.id),
    ),
  )
}

/** Live stop of the day model by id (finishStop needs the live photos). */
export function liveStop(
  model: DaySortModel,
  stopId: string,
): SortStop | undefined {
  return model.stops.find((stop) => stop.stop.id === stopId)
}
