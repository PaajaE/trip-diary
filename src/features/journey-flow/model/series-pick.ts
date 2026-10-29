/**
 * Série (M-Serie, W-Serie): the recommended shot is pre-selected to keep,
 * every other photo of the series goes to the trash unless the user flips
 * its mark. Nothing is written until the bulk action. Pure.
 */
import type {
  SessionPhoto,
  PhotoState,
} from '@/features/journey-flow/model/sort-session'
import type { TrashHintReason } from '@/features/journey-flow/model/day-sort'

/** Below this sharpness relative to the sharpest of the series: "méně ostrá". */
export const LESS_SHARP_MAX = 0.8

export type SeriesNote = TrashHintReason | 'lessSharp' | 'recommended'

/**
 * Pre-selection: the recommended shot, photos already kept and the user's
 * ★ photos (`starred` includes a ★ still being saved). The bulk action may
 * trash only what is not pre-selected unless the user flips it.
 */
export function initialKeep(
  series: readonly SessionPhoto[],
  starred: (id: string) => boolean = (id) =>
    series.some((photo) => photo.item.id === id && photo.item.starred),
): Set<string> {
  const keep = new Set(
    series
      .filter(
        (photo) =>
          photo.recommended || photo.state === 'keep' || starred(photo.item.id),
      )
      .map((photo) => photo.item.id),
  )
  const first = series[0]
  if (keep.size === 0 && first !== undefined) keep.add(first.item.id)
  return keep
}

export function toggleKeep(keep: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(keep)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** What the bulk action does: "Nechávám 2 ze 7, zbylých 5 půjde do koše". */
export function seriesOutcome(
  series: readonly SessionPhoto[],
  keep: ReadonlySet<string>,
): { keepIds: string[]; trashIds: string[] } {
  const keepIds: string[] = []
  const trashIds: string[] = []
  for (const photo of series) {
    if (keep.has(photo.item.id)) keepIds.push(photo.item.id)
    else trashIds.push(photo.item.id)
  }
  return { keepIds, trashIds }
}

/**
 * The states the compare duel reads inside the series: kept or still open.
 * Not kept is only the default of the bulk action, so every photo of the
 * series can still come as a challenger.
 */
export function seriesStates(
  series: readonly SessionPhoto[],
  keep: ReadonlySet<string>,
): Map<string, PhotoState> {
  return new Map(
    series.map((photo) => [
      photo.item.id,
      keep.has(photo.item.id) ? 'keep' : 'open',
    ]),
  )
}

/** The short note under a photo of the series. */
export function seriesNote(
  photo: SessionPhoto,
  sharpness: ReadonlyMap<string, number | null>,
): SeriesNote | null {
  if (photo.recommended) return 'recommended'
  if (photo.trashHint !== null) return photo.trashHint
  const relative = sharpness.get(photo.item.id) ?? null
  return relative !== null && relative < LESS_SHARP_MAX ? 'lessSharp' : null
}
