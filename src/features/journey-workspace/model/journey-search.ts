/**
 * Client-side search over the journey data the workspace already holds in
 * memory (moments, day notes, media captions). Works offline and needs no
 * server call. The server RPC `search_journey` exists as a future option for
 * huge journeys; production does not have it yet, so it is not used here.
 */
import type { MediaItem } from '@/entities/media/model/media-library'
import { createNightDayResolver } from '@trip-diary/core/automation'
import { safeZone } from '@/features/journey-workspace/model/workspace-days'

export const MIN_QUERY_LENGTH = 2
export const DEFAULT_SEARCH_LIMIT = 50
const SNIPPET_LENGTH = 120

export interface SearchMoment {
  body: string
  id: string
  /** Place name of the moment, when known. */
  placeLabel: string | null
  startsAt: string
  title: string | null
  /** IANA zone of the experience; null = device zone. */
  tz?: string | null
}

export interface SearchDayNote {
  body: string
  /** Local day "YYYY-MM-DD". */
  date: string
}

export interface SearchData {
  dayNotes: readonly SearchDayNote[]
  media: readonly MediaItem[]
  moments: readonly SearchMoment[]
}

export interface SearchFilters {
  noCaption?: boolean
  noLocation?: boolean
  starred?: boolean
  video?: boolean
}

export type SearchResultKind = 'moment' | 'day' | 'media'

export interface SearchResult {
  id: string
  kind: SearchResultKind
  /** Local day "YYYY-MM-DD" the result belongs to; null when it has none. */
  localDate: string | null
  snippet: string
  /** Title text; may be empty (the UI then shows a generic label). */
  title: string
}

export interface SearchOutcome {
  /** Total matches per kind, regardless of the limit. */
  counts: Record<SearchResultKind, number>
  results: SearchResult[]
  /** Total matches regardless of the limit. */
  total: number
}

const MARKS = /\p{M}+/gu
const WHITESPACE = /\s+/g

/** Lower-case, accent-free, single-spaced, trimmed. */
export function normalizeQuery(text: string): string {
  return fold(text).replace(WHITESPACE, ' ').trim()
}

function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(MARKS, '')
}

/**
 * Folded text plus, for every folded UTF-16 unit, the index of the original
 * code unit it came from (so a match can be cut out of the original text).
 */
function foldWithMap(text: string): { folded: string; origin: number[] } {
  let folded = ''
  const origin: number[] = []
  let index = 0
  for (const char of text) {
    const part = fold(char)
    origin.push(...new Array<number>(part.length).fill(index))
    folded += part
    index += char.length
  }
  return { folded, origin }
}

function collapse(text: string): string {
  return text.replace(WHITESPACE, ' ').trim()
}

/** ~120 characters of `text` around the match at folded position `at`. */
function snippetAround(
  text: string,
  term: string,
  limit = SNIPPET_LENGTH,
): string {
  const { folded, origin } = foldWithMap(text)
  const at = folded.indexOf(term)
  if (at < 0) return collapse(text).slice(0, limit)
  const start = origin[at] ?? 0
  const lastUnit = origin[at + term.length - 1] ?? start
  const end = lastUnit + 1
  const room = Math.max(0, limit - (end - start))
  let from = Math.max(0, start - Math.floor(room / 2))
  const to = Math.min(text.length, from + limit)
  from = Math.max(0, Math.min(from, to - limit))
  const slice = collapse(text.slice(from, to))
  return `${from > 0 ? '…' : ''}${slice}${to < text.length ? '…' : ''}`
}

type DayOf = (iso: string | null, tz: string | null) => string | null

/**
 * Day of an instant by the author's night, the same rule as the outline and
 * the day pages, so a search hit opens the day the item is shown under.
 */
function dayResolver(data: SearchData): DayOf {
  const samples = [
    ...data.moments.map((m) => ({ iso: m.startsAt, tz: m.tz ?? null })),
    ...data.media.map((m) => ({ iso: m.capturedAt, tz: m.capturedTz })),
  ].flatMap(({ iso, tz }) => {
    const time = iso === null ? Number.NaN : Date.parse(iso)
    return Number.isNaN(time) ? [] : [{ time, zone: safeZone(tz) }]
  })
  const resolve = createNightDayResolver(samples)
  return (iso, tz) => {
    const time = iso === null ? Number.NaN : Date.parse(iso)
    return Number.isNaN(time) ? null : resolve(time, safeZone(tz)).date
  }
}

interface Candidate {
  /** Folded text per field, in snippet preference order. */
  fields: { folded: string; original: string }[]
  result: SearchResult
}

function compare(a: SearchResult, b: SearchResult): number {
  if (a.localDate !== b.localDate) {
    if (a.localDate === null) return 1
    if (b.localDate === null) return -1
    return a.localDate < b.localDate ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

const KIND_ORDER: Record<SearchResultKind, number> = {
  day: 1,
  media: 2,
  moment: 0,
}

function hasFilters(filters: SearchFilters): boolean {
  return (
    filters.starred === true ||
    filters.video === true ||
    filters.noLocation === true ||
    filters.noCaption === true
  )
}

function passesMediaFilters(item: MediaItem, filters: SearchFilters): boolean {
  if (filters.starred === true && !item.starred) return false
  if (filters.video === true && item.kind !== 'video') return false
  if (
    filters.noLocation === true &&
    item.latitude !== null &&
    item.longitude !== null
  )
    return false
  if (
    filters.noCaption === true &&
    item.caption !== null &&
    item.caption.trim() !== ''
  )
    return false
  return true
}

/**
 * Searches moments, day notes and media. Every whitespace-separated term must
 * occur (substring, case- and accent-insensitive) somewhere in the item. A
 * query shorter than two characters matches no text; filters then still list
 * media. Filters (starred, video, no location, no caption) describe media, so
 * with any filter on only media are searched (text AND filters); moments and
 * day notes are searched by text alone.
 */
export function searchJourney(
  data: SearchData,
  query: string,
  filters: SearchFilters = {},
  limit: number = DEFAULT_SEARCH_LIMIT,
): SearchOutcome {
  const normalized = normalizeQuery(query)
  const textOn = normalized.length >= MIN_QUERY_LENGTH
  const filtersOn = hasFilters(filters)
  const terms = textOn ? normalized.split(' ') : []
  const empty: SearchOutcome = {
    counts: { day: 0, media: 0, moment: 0 },
    results: [],
    total: 0,
  }
  if (!textOn && !filtersOn) return empty

  const dayOf = dayResolver(data)
  const momentDate = new Map<string, string | null>()
  for (const moment of data.moments) {
    momentDate.set(moment.id, dayOf(moment.startsAt, moment.tz ?? null))
  }

  const matches: { kind: SearchResultKind; candidate: Candidate }[] = []
  const matchesTerms = (fields: Candidate['fields']): boolean => {
    for (const term of terms) {
      if (!fields.some((field) => field.folded.includes(term))) return false
    }
    return true
  }
  const field = (original: string | null): Candidate['fields'][number] => ({
    folded: original === null ? '' : fold(original),
    original: original ?? '',
  })

  // Moments and day notes have no star/video/location/caption attribute, so
  // any filter excludes them: the filters ask for specific media.
  if (textOn && !filtersOn) {
    for (const moment of data.moments) {
      const fields = [
        field(moment.body),
        field(moment.placeLabel),
        field(moment.title),
      ]
      if (!matchesTerms(fields)) continue
      matches.push({
        candidate: {
          fields,
          result: {
            id: moment.id,
            kind: 'moment',
            localDate: momentDate.get(moment.id) ?? null,
            snippet: '',
            title: moment.title ?? moment.placeLabel ?? '',
          },
        },
        kind: 'moment',
      })
    }
    for (const note of data.dayNotes) {
      const fields = [field(note.body)]
      if (!matchesTerms(fields)) continue
      matches.push({
        candidate: {
          fields,
          result: {
            id: note.date,
            kind: 'day',
            localDate: note.date,
            snippet: '',
            title: note.date,
          },
        },
        kind: 'day',
      })
    }
  }

  for (const item of data.media) {
    if (!passesMediaFilters(item, filters)) continue
    const fields = [field(item.caption)]
    if (textOn && !matchesTerms(fields)) continue
    const own = dayOf(item.capturedAt, item.capturedTz)
    matches.push({
      candidate: {
        fields,
        result: {
          id: item.id,
          kind: 'media',
          localDate:
            own ??
            (item.momentId === null
              ? null
              : (momentDate.get(item.momentId) ?? null)),
          snippet: '',
          title: item.caption ?? '',
        },
      },
      kind: 'media',
    })
  }

  matches.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      compare(a.candidate.result, b.candidate.result),
  )

  const counts = { ...empty.counts }
  for (const match of matches) counts[match.kind] += 1
  const cap = Math.max(0, Math.floor(limit))
  const results = matches.slice(0, cap).map(({ candidate }) => {
    const first = terms[0]
    const source =
      first === undefined
        ? undefined
        : (candidate.fields.find((f) => f.folded.includes(first)) ??
          candidate.fields[0])
    return {
      ...candidate.result,
      snippet:
        source === undefined
          ? collapse(candidate.fields[0]?.original ?? '').slice(
              0,
              SNIPPET_LENGTH,
            )
          : snippetAround(source.original, first ?? ''),
    }
  })
  return { counts, results, total: matches.length }
}
