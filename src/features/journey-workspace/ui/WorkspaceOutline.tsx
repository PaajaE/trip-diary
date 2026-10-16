import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  momentElementId,
  segmentElementId,
} from '@/features/journey-workspace/lib/outline-ids'
import type {
  WorkspaceMoment,
  WorkspaceSegment,
  WorkspaceTree,
} from '@/features/journey-workspace/model/workspace-tree'
import { cn } from '@/shared/lib/cn'

/** Where an outline click goes: an element id plus segments to expand first. */
export interface OutlineTarget {
  elementId: string
  /** Segment ids that must be open for the element to exist. */
  expand: string[]
  /** Set for moments, so the map can follow. */
  momentId?: string
}

interface OutlineItem {
  ancestors: string[]
  depth: number
  elementId: string
  expand: string[]
  kind: 'moment' | 'segment'
  label: string
  momentId?: string
  photoCount: number
}

function flatten(
  tree: WorkspaceTree,
  momentLabel: (entry: WorkspaceMoment) => string,
): OutlineItem[] {
  const out: OutlineItem[] = []
  const moment = (
    entry: WorkspaceMoment,
    depth: number,
    open: string[],
  ): OutlineItem => ({
    ancestors: open.map(segmentElementId),
    depth,
    elementId: momentElementId(entry.moment.id),
    expand: open,
    kind: 'moment',
    label: momentLabel(entry),
    momentId: entry.moment.id,
    photoCount: entry.photoCount,
  })
  const walk = (node: WorkspaceSegment, depth: number, open: string[]) => {
    const here = [...open, node.segment.id]
    out.push({
      ancestors: open.map(segmentElementId),
      depth,
      elementId: segmentElementId(node.segment.id),
      expand: here,
      kind: 'segment',
      label: node.segment.title,
      photoCount: node.photoCount,
    })
    for (const entry of node.moments) out.push(moment(entry, depth + 1, here))
    for (const child of node.children) walk(child, depth + 1, here)
  }
  for (const root of tree.roots) walk(root, 0, [])
  for (const entry of tree.looseMoments) out.push(moment(entry, 0, []))
  return out
}

/**
 * Compact tree of stages > trips > moments with photo counts. The section in
 * view (found with an IntersectionObserver) is highlighted; clicking an entry
 * asks the workspace to expand and scroll to it.
 */
export function WorkspaceOutline({
  momentLabel,
  observeKey,
  onNavigate,
  tree,
}: {
  momentLabel: (entry: WorkspaceMoment) => string
  /** Changes whenever sections open or close, so observers are re-attached. */
  observeKey: unknown
  onNavigate: (target: OutlineTarget) => void
  tree: WorkspaceTree
}) {
  const { t } = useTranslation()
  const items = useMemo(() => flatten(tree, momentLabel), [tree, momentLabel])
  const [activeId, setActiveId] = useState<string | null>(null)

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

  const activePath = new Set(
    items.find((item) => item.elementId === activeId)?.ancestors ?? [],
  )

  return (
    <nav aria-label={t('owner.outline')}>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const active = item.elementId === activeId
          return (
            <li key={item.elementId}>
              <button
                aria-current={active ? 'location' : undefined}
                className={cn(
                  'flex min-h-9 w-full items-center justify-between gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors hover:bg-surface',
                  item.kind === 'segment' ? 'font-semibold' : 'text-muted',
                  activePath.has(item.elementId) && 'text-foreground',
                  active && 'bg-primary/10 font-semibold text-primary',
                )}
                style={{ paddingLeft: `${String(item.depth * 0.75 + 0.5)}rem` }}
                type="button"
                onClick={() => {
                  setActiveId(item.elementId)
                  onNavigate({
                    elementId: item.elementId,
                    expand: item.expand,
                    ...(item.momentId === undefined
                      ? {}
                      : { momentId: item.momentId }),
                  })
                }}
              >
                <span className="min-w-0 truncate">{item.label}</span>
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
    </nav>
  )
}
