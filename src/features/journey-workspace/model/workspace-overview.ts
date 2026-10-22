import type { MediaItem } from '@/entities/media/model/media-library'
import type { Segment } from '@/entities/segment/model/segment'
import { pickThumbVariant } from '@/features/journey-workspace/lib/media-thumb'
import {
  looseElementId,
  segmentElementId,
} from '@/features/journey-workspace/lib/outline-ids'
import {
  dayNumber,
  firstDayKey,
  groupMomentsByDay,
  type MomentDay,
} from '@/features/journey-workspace/model/workspace-days'
import {
  computeTasks,
  dayHasStar,
  dayHasText,
  momentsUnderWrittenSegments,
  type WorkspaceTasks,
} from '@/features/journey-workspace/model/workspace-tasks'
import {
  buildTimeline,
  collectMoments,
  type WorkspaceMoment,
  type WorkspaceSegment,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'

/** Photos in a day card mosaic: one hero and two more. */
export const MOSAIC_SIZE = 3
/** Place names shown on a day card. */
export const CARD_PLACES = 3
/** Colours of the whole-journey strip (cycled over the chapters). */
export const STRIP_COLORS = 5

export interface OverviewDay {
  /** Local day key ("2026-05-29") or UNKNOWN_DAY. */
  key: string
  momentIds: string[]
  /** "Day N" counted from the journey's first day, null when unknown. */
  number: number | null
  photoCount: number
  /** Deduplicated stop names in time order (title, else place name). */
  places: string[]
  /** Hero first, then up to two more from other stops. */
  mosaic: MediaItem[]
  hasText: boolean
  starred: boolean
}

export type ChapterKind = 'loose' | 'stage' | 'trip'

export interface OverviewChapter {
  colorIndex: number
  cover: MediaItem | null
  days: OverviewDay[]
  /** DOM id the rail, the strip and the map scroll to. */
  elementId: string
  endsAt: string | null
  id: string
  kind: ChapterKind
  node: WorkspaceSegment | null
  photoCount: number
  /** Share of the chapter's days that have text, 0..1. */
  progress: number
  segment: Segment | null
  startsAt: string | null
  /** Suggested segments nested in this chapter (never the chapter itself). */
  suggestions: WorkspaceSegment[]
  suggested: boolean
  tz: string | null
}

export interface StripDay {
  chapterId: string
  colorIndex: number
  key: string
  loose: boolean
}

export interface WorkspaceOverview {
  chapters: OverviewChapter[]
  /** Chapter that first lists a day, by day key. */
  chapterOfDay: ReadonlyMap<string, string>
  /** Every calendar day of the journey, in time order. */
  days: MomentDay[]
  /** Day key of every moment. */
  dayOfMoment: ReadonlyMap<string, string>
  firstDay: string | null
  strip: StripDay[]
  tasks: WorkspaceTasks
}

function stopName(
  entry: WorkspaceMoment,
  nameOf: (placeId: string) => string | undefined,
): string {
  const title = entry.moment.title?.trim() ?? ''
  if (title !== '') return title
  const id = entry.moment.placeId
  return id === null ? '' : (nameOf(id)?.trim() ?? '')
}

/** Distinct stop names of a day in time order, compared case-insensitively. */
export function dayStopNames(
  moments: readonly WorkspaceMoment[],
  nameOf: (placeId: string) => string | undefined,
  max = CARD_PLACES,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of moments) {
    const name = stopName(entry, nameOf)
    const key = name.toLocaleLowerCase()
    if (name === '' || seen.has(key)) continue
    seen.add(key)
    out.push(name)
    if (out.length >= max) break
  }
  return out
}

function usable(item: MediaItem): boolean {
  return pickThumbVariant(item) !== null
}

function coverOf(entry: WorkspaceMoment): MediaItem | null {
  if (entry.cover !== null && usable(entry.cover)) return entry.cover
  return entry.media.find(usable) ?? null
}

/**
 * The three pictures of a day card. Hero: the first starred photo of the
 * day, else the chapter cover when it belongs to the day, else the cover of
 * the biggest stop. The other two come from different stops (biggest first);
 * when the day has fewer stops they are filled with more photos in order.
 */
export function pickMosaic(
  moments: readonly WorkspaceMoment[],
  preferredCoverId: string | null = null,
): MediaItem[] {
  const stops = moments.filter((entry) => entry.media.some(usable))
  if (stops.length === 0) return []
  const all = stops.flatMap((entry) => entry.media.filter(usable))
  const biggest = [...stops].sort((a, b) => b.media.length - a.media.length)[0]
  const hero =
    all.find((item) => item.starred) ??
    (preferredCoverId === null
      ? undefined
      : all.find((item) => item.id === preferredCoverId)) ??
    (biggest === undefined ? null : coverOf(biggest)) ??
    all[0]
  if (hero === undefined) return []
  const picked = [hero]
  const used = new Set([hero.id])
  const others = stops
    .filter((entry) => entry.moment.id !== hero.momentId)
    .sort((a, b) => b.media.length - a.media.length)
  for (const entry of others) {
    if (picked.length >= MOSAIC_SIZE) break
    const cover = coverOf(entry)
    if (cover === null || used.has(cover.id)) continue
    picked.push(cover)
    used.add(cover.id)
  }
  for (const item of all) {
    if (picked.length >= MOSAIC_SIZE) break
    if (used.has(item.id)) continue
    picked.push(item)
    used.add(item.id)
  }
  return picked
}

function flattenMoments(node: WorkspaceSegment): WorkspaceMoment[] {
  return [...node.moments, ...node.children.flatMap(flattenMoments)].sort(
    (a, b) =>
      Date.parse(a.moment.startsAt) - Date.parse(b.moment.startsAt) ||
      a.moment.id.localeCompare(b.moment.id),
  )
}

function nestedSuggestions(node: WorkspaceSegment): WorkspaceSegment[] {
  return node.children.flatMap((child) => [
    ...(child.segment.origin === 'suggested' ? [child] : []),
    ...nestedSuggestions(child),
  ])
}

/**
 * Overview of the journey: chapters (stages, loose runs between them) with
 * one card per day, the whole-journey day strip and the task bar counts.
 * `nameOf` resolves place ids; `fallbackTz` places moments without a zone.
 */
export function buildOverview(
  tree: WorkspaceTree,
  nameOf: (placeId: string) => string | undefined,
  fallbackTz: string | null,
  /** Local days (day keys) that have a day note: they count as text. */
  noteDays: ReadonlySet<string> = new Set(),
): WorkspaceOverview {
  const all = collectMoments(tree)
  const firstDay = firstDayKey(all, fallbackTz)
  const written = momentsUnderWrittenSegments(tree)
  const days = groupMomentsByDay(all, fallbackTz)
  const dayOfMoment = new Map<string, string>()
  for (const day of days)
    for (const entry of day.moments) dayOfMoment.set(entry.moment.id, day.key)

  const cardOf = (day: MomentDay, coverId: string | null): OverviewDay => ({
    hasText: dayHasText(day.moments, written, noteDays.has(day.key)),
    key: day.key,
    momentIds: day.moments.map((entry) => entry.moment.id),
    mosaic: pickMosaic(day.moments, coverId),
    number: dayNumber(firstDay, day.key),
    photoCount: day.photoCount,
    places: dayStopNames(day.moments, nameOf),
    starred: dayHasStar(day.moments),
  })

  const chapters: OverviewChapter[] = []
  let colored = 0
  for (const entry of buildTimeline(tree)) {
    const loose = entry.kind === 'loose'
    const moments = loose ? entry.moments : flattenMoments(entry.node)
    const cover = loose ? (moments[0]?.cover ?? null) : entry.node.cover
    const cards = groupMomentsByDay(moments, fallbackTz).map((day) =>
      cardOf(day, cover?.id ?? null),
    )
    const first = moments[0]
    const last = moments[moments.length - 1]
    const segment = loose ? null : entry.node.segment
    const id = loose ? entry.scope : entry.node.segment.id
    chapters.push({
      colorIndex: loose ? 0 : colored % STRIP_COLORS,
      cover,
      days: cards,
      elementId: loose ? looseElementId(entry.scope) : segmentElementId(id),
      endsAt: segment?.endsAt ?? last?.moment.endsAt ?? null,
      id,
      kind: loose ? 'loose' : entry.node.segment.kind,
      node: loose ? null : entry.node,
      photoCount: moments.reduce((sum, m) => sum + m.photoCount, 0),
      progress:
        cards.length === 0
          ? 0
          : cards.filter((card) => card.hasText).length / cards.length,
      segment,
      startsAt: segment?.startsAt ?? first?.moment.startsAt ?? null,
      suggested: segment?.origin === 'suggested',
      suggestions: loose ? [] : nestedSuggestions(entry.node),
      tz: segment?.tz ?? first?.tz ?? fallbackTz,
    })
    if (!loose) colored += 1
  }

  const chapterOfDay = new Map<string, string>()
  const strip: StripDay[] = []
  for (const chapter of chapters) {
    for (const card of chapter.days) {
      if (chapterOfDay.has(card.key)) continue
      chapterOfDay.set(card.key, chapter.id)
      strip.push({
        chapterId: chapter.id,
        colorIndex: chapter.colorIndex,
        key: card.key,
        loose: chapter.kind === 'loose',
      })
    }
  }

  return {
    chapterOfDay,
    chapters,
    dayOfMoment,
    days,
    firstDay,
    strip,
    tasks: computeTasks(tree, days, noteDays),
  }
}
