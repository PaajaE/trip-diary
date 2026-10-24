import { Link } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUnreviewedMediaQuery } from '@/entities/media/api/use-unreviewed-media-query'
import type { MediaItem } from '@/entities/media/model/media-library'
import { useCanEditJourney } from '@/features/journey-workspace/api/use-can-edit-journey'
import { useJourneyWorkspace } from '@/features/journey-workspace/api/use-journey-workspace'
import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import { MediaViewer } from '@/features/journey-workspace/ui/MediaViewer'
import { useDaySelection } from '@/features/journey-workspace/ui/day/use-day-selection'
import { OrganizeJourneyButton } from '@/features/journey-organize/ui/OrganizeJourneyButton'
import { useBatchActions } from '@/features/media-batch/api/use-batch-actions'
import {
  batchOrder,
  groupBatchByDay,
  type BatchDay,
} from '@/features/media-batch/model/batch-days'
import {
  buildFilterModel,
  filterDays,
  matchesFilter,
  type BatchFilter,
} from '@/features/media-batch/model/batch-filters'
import { buildMoveStops } from '@/features/media-batch/model/move-sheet'
import { BatchActionBar } from '@/features/media-batch/ui/BatchActionBar'
import { BatchFilterBar } from '@/features/media-batch/ui/BatchFilterBar'
import { MoveToSheet } from '@/features/media-batch/ui/MoveToSheet'
import { useDragSelect } from '@/features/media-batch/ui/use-drag-select'
import { BatchDaySection } from '@/features/media-batch/ui/BatchDaySection'
import { QuickSortView } from '@/features/media-batch/ui/QuickSortView'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'
import { EmptyState } from '@/shared/ui/EmptyState'

const NO_TARGETS = new Map<string, never[]>()

/** What the Move-to sheet moves: the selection, or one item of the viewer. */
type SheetState =
  | { source: 'selection' }
  | { item: MediaItem; source: 'viewer' }

interface ViewerState {
  opener: HTMLElement | null
  startId: string
}

/** "Dávka k roztřídění": unsorted media of the journey, grouped by day. */
export function BatchPage({ journeyId }: { journeyId: string }) {
  const { i18n, t } = useTranslation()
  const query = useUnreviewedMediaQuery(journeyId)
  const workspace = useJourneyWorkspace(journeyId)
  const { canEdit } = useCanEditJourney(journeyId)
  const actions = useBatchActions(journeyId)
  const selection = useDaySelection()
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [quickSort, setQuickSort] = useState<{
    opener: HTMLElement | null
  } | null>(null)
  const [filter, setFilter] = useState<BatchFilter>('all')
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const locale = i18n.language

  const items = query.data
  const allDays = useMemo(() => groupBatchByDay(items ?? []), [items])
  const allOrder = useMemo(() => batchOrder(allDays), [allDays])
  const filterModel = useMemo(() => buildFilterModel(items ?? []), [items])
  // A filter nothing matches any more falls back to "All".
  const activeFilter: BatchFilter =
    filterModel.counts[filter] === 0 ? 'all' : filter
  if (items !== undefined && filter !== activeFilter) setFilter(activeFilter)
  const days = useMemo(
    () => filterDays(allDays, activeFilter, filterModel),
    [allDays, activeFilter, filterModel],
  )
  const order = useMemo(() => batchOrder(days), [days])
  const shown = order.length
  const shownItems = useMemo(
    () =>
      (items ?? []).filter((item) =>
        matchesFilter(item, activeFilter, filterModel),
      ),
    [items, activeFilter, filterModel],
  )
  const selected = useMemo(
    () => (items ?? []).filter((item) => selection.ids.has(item.id)),
    [items, selection.ids],
  )
  const stops = useMemo(
    () =>
      workspace.status === 'ready'
        ? buildMoveStops(workspace.tree, t, locale)
        : [],
    [workspace, t, locale],
  )
  const sheetItems = useMemo(() => {
    if (sheet === null) return []
    if (sheet.source === 'viewer') return [sheet.item]
    const position = new Map(allOrder.map((id, index) => [id, index]))
    return [...selected].sort(
      (a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
    )
  }, [sheet, selected, allOrder])

  // Sorted tiles vanish from the list; forget them in the selection too.
  const { ids: selectedIds, setMany } = selection
  useEffect(() => {
    if (items === undefined || selected.length === selectedIds.size) return
    const present = new Set(items.map((item) => item.id))
    setMany(
      [...selectedIds].filter((id) => !present.has(id)),
      false,
    )
  }, [items, selected.length, selectedIds, setMany])

  // A filter change hides tiles; hidden media leave the selection too, so an
  // action never touches what the user cannot see.
  useEffect(() => {
    if (items === undefined) return
    const visible = new Set(order)
    const hidden = [...selectedIds].filter((id) => !visible.has(id))
    if (hidden.length > 0) setMany(hidden, false)
  }, [items, order, selectedIds, setMany])

  const drag = useDragSelect({
    enabled: canEdit && shown > 0,
    order,
    selection,
  })

  useEffect(() => {
    if (!selection.mode || viewer !== null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (document.querySelector('[role="dialog"]') !== null) return
      selection.clear()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [selection, viewer])

  function activate(item: MediaItem, trigger: HTMLElement, range: boolean) {
    if (canEdit && selection.mode) {
      selection.toggle(item.id, order, range)
    } else {
      setViewer({ opener: trigger, startId: item.id })
    }
  }

  function toggleDay(day: BatchDay, on: boolean) {
    selection.setMany(
      day.items.map((item) => item.id),
      on,
    )
    if (on) selection.setMode(true)
  }

  function pickStop(stopId: string) {
    const current = sheet
    setSheet(null)
    if (current === null) return
    if (current.source === 'selection') {
      afterAction(actions.moveTo(selected, stopId))
    } else {
      void actions.moveTo([current.item], stopId)
    }
  }

  function newStopFromSheet() {
    const current = sheet
    setSheet(null)
    if (current === null) return
    if (current.source === 'selection') afterAction(actions.newStop(selected))
    else void actions.newStop([current.item])
  }

  function afterAction(done: Promise<boolean>) {
    void done.then((ok) => {
      if (ok) selection.clear()
    })
  }

  if (query.isError) {
    return (
      <div className="space-y-3" role="alert">
        <p>{t('mediaBatch.loadError')}</p>
        <button
          className={buttonVariants({ variant: 'secondary' })}
          type="button"
          onClick={() => {
            void query.refetch()
          }}
        >
          {t('common.tryAgain')}
        </button>
      </div>
    )
  }
  if (items === undefined) {
    return <p role="status">{t('common.loading')}</p>
  }

  const remaining = items.length
  return (
    <div
      className={cn('space-y-6', selection.mode && 'pb-32 min-[760px]:pb-0')}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p
          aria-live="polite"
          className="mr-auto text-lg font-semibold"
          data-testid="batch-remaining"
          role="status"
        >
          {t('mediaBatch.remaining', { count: remaining })}
          {activeFilter === 'all' ? null : (
            <span
              className="ml-2 text-sm font-normal text-muted"
              data-testid="batch-shown"
            >
              {t('mediaBatch.shown', { count: shown })}
            </span>
          )}
        </p>
        {remaining > 0 && canEdit ? (
          <button
            className={buttonVariants({ variant: 'primary' })}
            type="button"
            onClick={(event) => {
              setQuickSort({ opener: event.currentTarget })
            }}
          >
            {t('quickSort.open')}
          </button>
        ) : null}
        {remaining > 0 && canEdit ? (
          <button
            aria-pressed={selection.mode}
            className={cn(
              buttonVariants({ variant: 'secondary' }),
              selection.mode && 'border-primary text-primary',
            )}
            type="button"
            onClick={() => {
              if (selection.mode) selection.clear()
              else selection.setMode(true)
            }}
          >
            {t('mediaBatch.select')}
          </button>
        ) : null}
        {canEdit ? <OrganizeJourneyButton journeyId={journeyId} /> : null}
      </div>

      {remaining > 0 ? (
        <BatchFilterBar
          active={activeFilter}
          model={filterModel}
          onChange={setFilter}
        />
      ) : null}

      {remaining === 0 ? (
        <EmptyState
          action={
            <Link
              className={buttonVariants({ variant: 'primary' })}
              params={{ journeyId }}
              to="/j/$journeyId/import"
            >
              {t('mediaImport.link')}
            </Link>
          }
          description={t('mediaBatch.emptyDescription')}
          icon={Inbox}
          title={t('mediaBatch.emptyTitle')}
        />
      ) : (
        <div
          className={cn(
            'space-y-6 select-none [-webkit-touch-callout:none]',
            drag.dragging && 'touch-none',
          )}
          ref={drag.ref}
          {...drag.gridProps}
        >
          {days.map((day) => (
            <BatchDaySection
              allSelected={day.items.every((item) =>
                selection.ids.has(item.id),
              )}
              baseUrl={BASE_URL}
              canEdit={canEdit}
              day={day}
              isSelected={selection.has}
              key={day.key}
              locale={locale}
              selecting={canEdit && selection.mode}
              onActivate={activate}
              onToggleDay={toggleDay}
            />
          ))}
        </div>
      )}

      {canEdit && selection.mode ? (
        <BatchActionBar
          allStarred={selected.length > 0 && selected.every((i) => i.starred)}
          count={selected.length}
          onClear={selection.clear}
          onDone={() => {
            afterAction(actions.done(selected))
          }}
          onOpenMove={() => {
            setSheet({ source: 'selection' })
          }}
          onNewStop={() => {
            afterAction(actions.newStop(selected))
          }}
          onStar={() => {
            void actions.star(selected)
          }}
          onTrash={() => {
            afterAction(actions.trash(selected))
          }}
        />
      ) : null}

      {quickSort === null ? null : (
        <QuickSortView
          actions={actions}
          baseUrl={BASE_URL}
          items={items}
          journeyId={journeyId}
          returnFocusTo={quickSort.opener}
          tree={workspace.status === 'ready' ? workspace.tree : null}
          onClose={() => {
            setQuickSort(null)
          }}
        />
      )}

      {viewer === null ? null : (
        <MediaViewer
          baseUrl={BASE_URL}
          edits={actions.edits}
          groups={[
            { id: 'batch', items: shownItems, title: t('mediaBatch.title') },
          ]}
          locale={locale}
          returnFocusTo={viewer.opener}
          startId={viewer.startId}
          targets={NO_TARGETS}
          onClose={() => {
            setViewer(null)
          }}
          onDelete={(item) => {
            void actions.trash([item])
          }}
          onExtractToMoment={(item) => {
            void actions.newStop([item])
          }}
          onMoveToMoment={(item) => {
            setSheet({ item, source: 'viewer' })
          }}
        />
      )}

      {sheet === null || sheetItems.length === 0 ? null : (
        <MoveToSheet
          baseUrl={BASE_URL}
          items={sheetItems}
          stops={stops}
          onClose={() => {
            setSheet(null)
          }}
          onNewStop={newStopFromSheet}
          onPick={pickStop}
        />
      )}
    </div>
  )
}
