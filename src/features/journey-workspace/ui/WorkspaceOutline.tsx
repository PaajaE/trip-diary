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
  groupMomentsByDay,
  LOOSE_SCOPE,
  momentOutlineLabel,
  UNKNOWN_DAY,
} from '@/features/journey-workspace/model/workspace-days'
import type {
  WorkspaceMoment,
  WorkspaceSegment,
  WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'
import { cn } from '@/shared/lib/cn'
import { OsmAttribution } from '@/shared/ui/OsmAttribution'

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
  /** Muted second line (stage date range). */
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
): { items: OutlineItem[]; hasPlaces: boolean } {
  const out: OutlineItem[] = []
  let hasPlaces = false

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
      const places = day.placeIds
        .map((id) => placeName(id))
        .filter((name): name is string => name !== null)
      if (places.length > 0) hasPlaces = true
      const date =
        day.key === UNKNOWN_DAY
          ? unknownDay
          : formatDayLabel(first.moment.startsAt, first.tz, locale)
      const label = [date, places.join(', ')]
        .filter((part) => part !== '')
        .join(' · ')
      const search = `${inherited} ${normalise([date, day.key, ...places].join(' '))}`
      out.push({
        ancestors,
        depth,
        elementId: dayId,
        expand: open,
        kind: 'day',
        label,
        momentId: first.moment.id,
        photoCount: day.photoCount,
        search,
      })
      for (const entry of day.moments) {
        const place = placeName(entry.moment.placeId)
        if (place !== null) hasPlaces = true
        const label = momentOutlineLabel(
          entry.moment.title,
          place,
          formatInstantTime(entry.moment.startsAt, entry.tz, locale),
        )
        out.push({
          ancestors: [...ancestors, dayId],
          depth: depth + 1,
          elementId: momentElementId(entry.moment.id),
          expand: open,
          kind: 'moment',
          label,
          momentId: entry.moment.id,
          photoCount: entry.photoCount,
          search: `${search} ${normalise(`${label} ${place ?? ''}`)}`,
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

/**
 * Compact tree of stages > trips > days > moments with photo counts. The row
 * in view (found with an IntersectionObserver) is highlighted; clicking a row
 * asks the workspace to expand and scroll to it. Only the stage holding the
 * current row is open by default; a filter narrows rows by place, title or
 * date.
 */
export function WorkspaceOutline({
  observeKey,
  onNavigate,
  placeNames,
  tree,
}: {
  /** Changes whenever sections open or close, so observers are re-attached. */
  observeKey: unknown
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
      ),
    [tree, placeNames, locale, unknownDay],
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
    (manual.get(item.elementId) ?? activePath.has(item.elementId))
  const rows = items.filter((item) => {
    if (shown !== null) return shown.has(item.elementId)
    // Rows under a collapsed stage or day stay hidden.
    return item.ancestors.every((id) => {
      const parent = items.find((candidate) => candidate.elementId === id)
      return parent === undefined || isOpen(parent)
    })
  })

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
        {rows.map((item) => {
          const active = item.elementId === activeId
          const open = isOpen(item)
          return (
            <li
              className="flex items-center"
              key={item.elementId}
              style={{ paddingLeft: `${String(item.depth * 0.75)}rem` }}
            >
              {item.kind === 'segment' ? (
                <button
                  aria-expanded={open}
                  aria-label={t(
                    open ? 'owner.outlineCollapse' : 'owner.outlineExpand',
                    { name: item.label },
                  )}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface"
                  type="button"
                  onClick={() => {
                    setManual((current) =>
                      new Map(current).set(item.elementId, !open),
                    )
                  }}
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
                  'flex min-h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg py-1.5 pr-2 pl-1 text-left text-sm transition-colors hover:bg-surface',
                  item.kind === 'moment' ? 'text-muted' : 'font-semibold',
                  item.kind === 'day' && 'font-medium',
                  activePath.has(item.elementId) && 'text-foreground',
                  active && 'bg-primary/10 font-semibold text-primary',
                )}
                type="button"
                onClick={() => {
                  setActiveId(item.elementId)
                  if (item.kind === 'segment')
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
                <span className="min-w-0">
                  <span className="block truncate">{item.label}</span>
                  {item.sub === undefined ? null : (
                    <span className="block truncate text-xs font-normal text-muted">
                      {item.sub}
                    </span>
                  )}
                </span>
                {item.photoCount > 0 ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    <span aria-hidden="true">{item.photoCount}</span>
                    <span className="sr-only">
                      {t('terms.photo.count', { count: item.photoCount })}
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
          <OsmAttribution />
        </p>
      ) : null}
    </nav>
  )
}
