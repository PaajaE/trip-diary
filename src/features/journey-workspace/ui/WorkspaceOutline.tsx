import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  formatCompactRange,
  formatDayLabel,
  formatInstantTime,
} from '@/features/journey-workspace/lib/format-range'
import {
  momentElementId,
  segmentElementId,
} from '@/features/journey-workspace/lib/outline-ids'
import {
  dayElementId,
  dayNumber,
  dayPlaceNames,
  firstDayKey,
  groupMomentsByDay,
  LOOSE_SCOPE,
  UNKNOWN_DAY,
} from '@/features/journey-workspace/model/workspace-days'
import {
  collectMoments,
  type WorkspaceMoment,
  type WorkspaceSegment,
  type WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'
import { cn } from '@/shared/lib/cn'
import { PlaceAttribution } from '@/shared/ui/PlaceAttribution'

export { LOOSE_SCOPE }

/** Where an outline click goes: an element id plus segments to expand first. */
export interface OutlineTarget {
  elementId: string
  /** Segment ids that must be open for the element to exist. */
  expand: string[]
  /** Set for moments (and days: their first moment), so the map can follow. */
  momentId?: string
}

interface OutlineItem {
  /** Element ids of the rows above this one (stages, trips, days). */
  ancestors: string[]
  depth: number
  elementId: string
  expand: string[]
  kind: 'day' | 'moment' | 'segment'
  label: string
  momentId?: string
  photoCount: number
  /** Normalised text the filter matches (own text plus inherited). */
  search: string
  /** Muted note beside the label ("Den 9"). */
  aside?: string
  /** Moments: place or title ("" when unnamed), start and end time. */
  name?: string
  time?: string
  timeEnd?: string
  /** Muted second line (stage date range, places of a day). */
  sub?: string
}

function normalise(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function flatten(
  tree: WorkspaceTree,
  placeName: (id: string | null) => string | null,
  locale: string,
  unknownDay: string,
  dayLabel: (n: number) => string,
): { items: OutlineItem[]; hasPlaces: boolean } {
  const out: OutlineItem[] = []
  let hasPlaces = false
  const firstDay = firstDayKey(collectMoments(tree))

  const days = (
    scope: string,
    entries: WorkspaceMoment[],
    depth: number,
    open: string[],
    ancestors: string[],
    inherited: string,
  ) => {
    for (const day of groupMomentsByDay(entries)) {
      const first = day.moments[0]
      if (first === undefined) continue
      const dayId = dayElementId(scope, day.key)
      const places = dayPlaceNames(day, (id) => placeName(id) ?? undefined, 2)
      if (places.length > 0) hasPlaces = true
      const date =
        day.key === UNKNOWN_DAY
          ? unknownDay
          : formatDayLabel(first.moment.startsAt, first.tz, locale)
      const number = dayNumber(firstDay, day.key)
      const search = `${inherited} ${normalise([date, day.key, ...places].join(' '))}`
      out.push({
        ancestors,
        ...(number === null ? {} : { aside: dayLabel(number) }),
        depth,
        elementId: dayId,
        expand: open,
        kind: 'day',
        label: date,
        momentId: first.moment.id,
        photoCount: day.photoCount,
        search,
        ...(places.length === 0 ? {} : { sub: places.join(' · ') }),
      })
      for (const entry of day.moments) {
        const place = placeName(entry.moment.placeId)
        if (place !== null) hasPlaces = true
        const title = entry.moment.title
        const name = title !== null && title !== '' ? title : (place ?? '')
        const time = formatInstantTime(entry.moment.startsAt, entry.tz, locale)
        out.push({
          ancestors: [...ancestors, dayId],
          depth: depth + 1,
          elementId: momentElementId(entry.moment.id),
          expand: open,
          kind: 'moment',
          label: name,
          momentId: entry.moment.id,
          name,
          photoCount: entry.photoCount,
          search: `${search} ${normalise(`${name} ${place ?? ''} ${time}`)}`,
          time,
          timeEnd: formatInstantTime(entry.moment.endsAt, entry.tz, locale),
        })
      }
    }
  }

  const walk = (
    node: WorkspaceSegment,
    depth: number,
    open: string[],
    ancestors: string[],
    inherited: string,
  ) => {
    const here = [...open, node.segment.id]
    const id = segmentElementId(node.segment.id)
    const search = `${inherited} ${normalise(node.segment.title)}`
    out.push({
      ancestors,
      depth,
      elementId: id,
      expand: here,
      kind: 'segment',
      label: node.segment.title,
      photoCount: node.photoCount,
      search,
      sub: formatCompactRange(
        node.segment.startsAt,
        node.segment.endsAt,
        node.segment.tz,
        locale,
        { withTime: false, withYear: true },
      ),
    })
    days(
      node.segment.id,
      node.moments,
      depth + 1,
      here,
      [...ancestors, id],
      search,
    )
    for (const child of node.children)
      walk(child, depth + 1, here, [...ancestors, id], search)
  }
  for (const root of tree.roots) walk(root, 0, [], [], '')
  days(LOOSE_SCOPE, tree.looseMoments, 0, [], [], '')
  return { hasPlaces, items: out }
}

interface OutlineRow {
  /** Moment element ids the row stands for (several for a group). */
  elementIds: string[]
  item: OutlineItem
  label: string
  photoCount: number
}

/**
 * Merges consecutive moment rows with the same non-empty name into one row:
 * "Field · 13:15–18:26 · 4×"; a single moment reads "Field · 13:15".
 */
function toRows(
  items: OutlineItem[],
  count: (n: number) => string,
): OutlineRow[] {
  const rows: OutlineRow[] = []
  let run: OutlineItem[] = []
  const flush = () => {
    const first = run[0]
    const last = run[run.length - 1]
    if (first === undefined || last === undefined) return
    const name = first.name ?? ''
    const start = first.time ?? ''
    const end = last.timeEnd ?? last.time ?? ''
    const times = run.length === 1 || end === start ? start : `${start}–${end}`
    const label = [name, times, run.length > 1 ? count(run.length) : '']
      .filter((part) => part !== '')
      .join(' · ')
    rows.push({
      elementIds: run.map((item) => item.elementId),
      item: first,
      label,
      photoCount: run.reduce((sum, item) => sum + item.photoCount, 0),
    })
    run = []
  }
  for (const item of items) {
    if (item.kind !== 'moment') {
      flush()
      rows.push({
        elementIds: [item.elementId],
        item,
        label: item.label,
        photoCount: item.photoCount,
      })
      continue
    }
    const prev = run[run.length - 1]
    const same =
      prev !== undefined &&
      (item.name ?? '') !== '' &&
      (prev.name ?? '').toLocaleLowerCase() ===
        (item.name ?? '').toLocaleLowerCase() &&
      prev.ancestors[prev.ancestors.length - 1] ===
        item.ancestors[item.ancestors.length - 1]
    if (!same) flush()
    run.push(item)
  }
  flush()
  return rows
}

/**
 * Compact tree of stages > trips > days with photo counts; a day opens to groups of
 * consecutive moments. The row
 * in view (found with an IntersectionObserver) is highlighted; clicking a row
 * asks the workspace to expand and scroll to it. Only the stage holding the
 * current row is open by default; a filter narrows rows by place, title or
 * date.
 */
export function WorkspaceOutline({
  observeKey,
  onActiveChange,
  onNavigate,
  placeNames,
  tree,
}: {
  /** Changes whenever sections open or close, so observers are re-attached. */
  observeKey: unknown
  /** The row in view (or clicked) changed; lets the map follow the scroll. */
  onActiveChange?: (elementId: string | null) => void
  onNavigate: (target: OutlineTarget) => void
  /** Place name by place id. */
  placeNames: ReadonlyMap<string, string>
  tree: WorkspaceTree
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const unknownDay = t('workspace.dayUnknown')
  const { hasPlaces, items } = useMemo(
    () =>
      flatten(
        tree,
        (id) => (id === null ? null : (placeNames.get(id) ?? null)),
        locale,
        unknownDay,
        (n) => t('workspace.dayNumber', { n }),
      ),
    [tree, placeNames, locale, unknownDay, t],
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [manual, setManual] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Set<string>()
    const pick = () => {
      const moment = items.find(
        (item) => item.kind === 'moment' && visible.has(item.elementId),
      )
      const found = moment ?? items.find((item) => visible.has(item.elementId))
      if (found !== undefined) setActiveId(found.elementId)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        pick()
      },
      // A band near the top of the viewport decides what is "current".
      { rootMargin: '-96px 0px -55% 0px' },
    )
    for (const item of items) {
      const element = document.getElementById(item.elementId)
      if (element !== null) observer.observe(element)
    }
    return () => {
      observer.disconnect()
    }
  }, [items, observeKey])

  // Until something is in view, treat the first moment as the current row.
  const current =
    items.find((item) => item.elementId === activeId) ??
    items.find((item) => item.kind === 'moment') ??
    null
  const currentId = current?.elementId ?? null
  useEffect(() => {
    onActiveChange?.(currentId)
  }, [currentId, onActiveChange])
  const activePath = new Set(
    current === null ? [] : [...current.ancestors, current.elementId],
  )
  const query = normalise(filter.trim())
  const shown = useMemo(() => {
    if (query === '') return null
    const ids = new Set<string>()
    for (const item of items) {
      if (!item.search.includes(query)) continue
      ids.add(item.elementId)
      for (const id of item.ancestors) ids.add(id)
    }
    return ids
  }, [items, query])

  const isOpen = (item: OutlineItem) =>
    shown !== null ||
    (manual.get(item.elementId) ??
      (item.kind === 'segment' && activePath.has(item.elementId)))
  const visibleItems = items.filter((item) => {
    if (shown !== null) return shown.has(item.elementId)
    // Rows under a collapsed stage or day stay hidden.
    return item.ancestors.every((id) => {
      const parent = items.find((candidate) => candidate.elementId === id)
      return parent === undefined || isOpen(parent)
    })
  })
  const rows = toRows(visibleItems, (n) => t('owner.outlineGroupCount', { n }))

  return (
    <nav aria-label={t('owner.outline')}>
      <input
        aria-label={t('owner.outlineFilter')}
        className="mb-2 min-h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
        placeholder={t('owner.outlineFilterPlaceholder')}
        type="search"
        value={filter}
        onChange={(event) => {
          setFilter(event.target.value)
        }}
      />
      {rows.length === 0 ? (
        <p className="px-2 text-sm text-muted">{t('owner.outlineNoMatch')}</p>
      ) : null}
      <ul className="space-y-0.5">
        {rows.map((row) => {
          const { item } = row
          const active =
            row.elementIds.includes(activeId ?? '') ||
            (item.kind === 'day' &&
              !isOpen(item) &&
              activePath.has(item.elementId))
          const open = isOpen(item)
          const expandable = item.kind !== 'moment'
          const toggle = () => {
            setManual((current) => new Map(current).set(item.elementId, !open))
          }
          return (
            <li
              className="flex items-start"
              key={item.elementId}
              style={{ paddingLeft: `${String(item.depth * 0.75)}rem` }}
            >
              {expandable ? (
                <button
                  aria-expanded={open}
                  aria-label={t(
                    open ? 'owner.outlineCollapse' : 'owner.outlineExpand',
                    {
                      name:
                        item.kind === 'day'
                          ? [item.label, item.sub ?? ''].join(' ').trim()
                          : item.label,
                    },
                  )}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface"
                  type="button"
                  onClick={toggle}
                >
                  <ChevronDown
                    aria-hidden="true"
                    className={open ? '' : '-rotate-90'}
                    size={14}
                  />
                </button>
              ) : (
                <span aria-hidden="true" className="size-7 shrink-0" />
              )}
              <button
                aria-current={active ? 'location' : undefined}
                className={cn(
                  'flex min-h-9 min-w-0 flex-1 items-start justify-between gap-2 rounded-lg py-1.5 pr-2 pl-1 text-left text-sm transition-colors hover:bg-surface',
                  item.kind === 'moment' ? 'text-muted' : 'font-semibold',
                  item.kind === 'day' && 'font-medium',
                  activePath.has(item.elementId) && 'text-foreground',
                  active && 'bg-primary/10 font-semibold text-primary',
                )}
                type="button"
                onClick={() => {
                  setActiveId(item.elementId)
                  if (expandable)
                    setManual((current) =>
                      new Map(current).set(item.elementId, true),
                    )
                  onNavigate({
                    elementId: item.elementId,
                    expand: item.expand,
                    ...(item.momentId === undefined
                      ? {}
                      : { momentId: item.momentId }),
                  })
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {row.label}
                    {item.aside === undefined ? null : (
                      <span className="ml-2 text-xs font-normal text-muted">
                        {item.aside}
                      </span>
                    )}
                  </span>
                  {item.sub === undefined ? null : (
                    <span className="block truncate text-xs font-normal text-muted">
                      {item.sub}
                    </span>
                  )}
                </span>
                {row.photoCount > 0 ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    <span aria-hidden="true">{row.photoCount}</span>
                    <span className="sr-only">
                      {t('terms.photo.count', { count: row.photoCount })}
                    </span>
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      {hasPlaces ? (
        <p className="mt-2 px-2">
          <PlaceAttribution />
        </p>
      ) : null}
    </nav>
  )
}
