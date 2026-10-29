import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { FlowActions } from '@/features/journey-flow/api/flow-actions'
import type { FlowDay } from '@/features/journey-flow/model/flow-days'
import {
  latestArrival,
  type FlowMarkers,
} from '@/features/journey-flow/model/flow-markers'
import {
  buildStopReview,
  previousStopId,
  type ReviewCard,
  type ReviewFilter,
  type StopCard,
} from '@/features/journey-flow/model/stop-review'
import { DayMap, type DayMapPin } from '@/features/journey-flow/ui/DayMap'
import { dayHeading, joinFacts } from '@/features/journey-flow/ui/flow-format'
import {
  RideCardView,
  TransitRow,
  TripCardView,
} from '@/features/journey-flow/ui/RideTripCards'
import {
  StopCardView,
  type StopMenuAction,
} from '@/features/journey-flow/ui/StopCardView'
import { ReviewOverlays } from '@/features/journey-flow/ui/ReviewOverlays'
import type { UnassignedActions } from '@/features/journey-flow/ui/UnassignedSheet'
import {
  countsText,
  stopNameText,
} from '@/features/journey-workspace/lib/moment-labels'
import type { MoveSheetStop } from '@/features/media-batch/model/move-sheet'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'

export type ReviewActions = Pick<
  FlowActions,
  | 'acknowledgeArrivals'
  | 'confirmStops'
  | 'createStopFromPhotos'
  | 'markOpened'
  | 'mergeWithPrevious'
  | 'movePhotos'
  | 'promoteEnRoute'
  | 'renameStop'
  | 'splitStop'
> &
  UnassignedActions

export interface ReviewScreenProps {
  actions: ReviewActions
  day: FlowDay
  journeyId: string
  /** Every photo of the journey (the original of a copy may be on another day). */
  lookup: ReadonlyMap<string, MediaItem>
  markers: FlowMarkers
  moveStops: readonly MoveSheetStop[]
  /** Step 2 (sorting the photos) of this day; the seam 7c plugs into. */
  onContinue: (dayKey: string) => void
}

export type ReviewOverlay =
  | { kind: 'move'; stopId: string }
  | { items: MediaItem[]; kind: 'moveTo' }
  | { kind: 'rename'; stopId: string }
  | { kind: 'split'; stopId: string }
  | { kind: 'unassigned' }

function stopCards(cards: readonly ReviewCard[]): StopCard[] {
  return cards.flatMap((card) =>
    card.kind === 'stop'
      ? [card]
      : card.kind === 'trip'
        ? stopCards(card.cards)
        : [],
  )
}

/**
 * Kontrola zastávek (step 1 of 2): map and stop cards of one day. The same
 * markup serves the phone (map above the list, sticky footer above the tab
 * bar) and the web (list left, sticky map right). Every edit has its own
 * touch-sized button; nothing depends on hover or a keyboard.
 */
export function ReviewScreen({
  actions,
  day,
  journeyId,
  lookup,
  markers,
  moveStops,
  onContinue,
}: ReviewScreenProps) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const [filter, setFilter] = useState<ReviewFilter>(() =>
    buildStopReview(day, markers).toCheckCount > 0 ? 'toCheck' : 'all',
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<ReviewOverlay | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const all = useMemo(() => buildStopReview(day, markers), [day, markers])
  const shown = useMemo(
    () => (filter === 'all' ? all : buildStopReview(day, markers, filter)),
    [all, day, filter, markers],
  )
  const allStops = useMemo(() => stopCards(all.cards), [all])
  const stopById = new Map(day.stops.map((stop) => [stop.id, stop]))

  const pins: DayMapPin[] = allStops.flatMap((card) =>
    card.stop.centre === null
      ? []
      : [
          {
            id: card.stop.id,
            label: stopNameText(card.stop.name, t, locale).text,
            latitude: card.stop.centre.latitude,
            longitude: card.stop.centre.longitude,
            number: card.number,
          },
        ],
  )

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch {
      setError(t('flow.screen.review.actionError'))
      return false
    } finally {
      setBusy(false)
    }
  }

  const select = (card: StopCard) => {
    setSelectedId(card.stop.id)
    if (card.toCheck && !card.opened)
      actions.markOpened(journeyId, card.stop.id)
  }
  const selectFromMap = (id: string) => {
    const card = allStops.find((entry) => entry.stop.id === id)
    if (card !== undefined) select(card)
    document
      .querySelector(`[data-stop-id="${id}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }

  const onAction = (stopId: string, action: StopMenuAction) => {
    setMenuId(null)
    if (action === 'merge') {
      const previous = previousStopId(day, stopId)
      if (previous !== null) {
        run(() => actions.mergeWithPrevious(previous, stopId)).catch(
          () => undefined,
        )
      }
      return
    }
    setOverlay({ kind: action, stopId })
  }

  const showUnopened = () => {
    setFilter('toCheck')
    const first = shown.unopenedToCheck[0] ?? all.unopenedToCheck[0]
    if (first !== undefined) setSelectedId(first)
  }

  const confirmAll = () => {
    run(async () => {
      if (all.confirmIds.length > 0) await actions.confirmStops(all.confirmIds)
      // Seen up to this day's newest arrival: "nová" ends with the review.
      // Only this day: other new days stay in Příjem.
      actions.acknowledgeArrivals(journeyId, {
        dayKey: day.key,
        seenUpTo: latestArrival(
          day.media,
          day.stops.map((stop) => stop.entry.moment),
        ),
        stopIds: day.stops.map((stop) => stop.id),
      })
      onContinue(day.key)
    }).catch(() => undefined)
  }

  const renderCard = (card: ReviewCard): ReactNode => {
    switch (card.kind) {
      case 'stop': {
        const id = card.stop.id
        return (
          <StopCardView
            busy={busy}
            canMerge={previousStopId(day, id) !== null}
            card={card}
            key={id}
            menuOpen={menuId === id}
            selected={selectedId === id}
            onAction={(action) => {
              onAction(id, action)
            }}
            onMenu={(open) => {
              setMenuId(open ? id : null)
            }}
            onSelect={() => {
              select(card)
            }}
          />
        )
      }
      case 'enRoute': {
        const first = card.stopIds[0]
        return (
          <RideCardView
            busy={busy}
            card={card}
            key={`ride-${first ?? ''}`}
            onPromote={() => {
              run(async () => {
                for (const id of card.stopIds) await actions.promoteEnRoute(id)
              }).catch(() => undefined)
            }}
          />
        )
      }
      case 'transit':
        return (
          <TransitRow
            card={card}
            key={`transit-${card.hint.from}-${card.hint.to}`}
          />
        )
      case 'trip':
        return (
          <TripCardView card={card} key={card.trip.id}>
            {card.cards.map(renderCard)}
          </TripCardView>
        )
    }
  }

  const overlayStop =
    overlay !== null && 'stopId' in overlay
      ? stopById.get(overlay.stopId)
      : undefined
  const unopened = all.unopenedToCheck.length
  const heading = dayHeading(day.key, locale)
  const facts = joinFacts([
    t('terms.moment.count', { count: all.stopCount }),
    countsText(t, {
      photos: day.media.filter((item) => item.kind === 'photo').length,
      videos: day.media.filter((item) => item.kind === 'video').length,
    }),
  ])
  const unassignedFacts = joinFacts([
    all.unassigned.media > 0
      ? t('terms.photo.count', { count: all.unassigned.media })
      : null,
    all.unassigned.copies > 0
      ? t('flow.review.copies', { count: all.unassigned.copies })
      : null,
    t('flow.screen.review.unassignedBody'),
  ])

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-semibold text-primary">
          {t('flow.review.step')}
        </p>
        <h2 className="text-xl font-semibold">{heading}</h2>
        <p className="text-sm text-muted">{facts}</p>
        <p className="mt-1 text-sm text-muted">{t('flow.review.autoHint')}</p>
      </header>

      {error === null ? null : (
        <p
          className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
        <div className="lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4 lg:self-start">
          <DayMap
            className="h-52 lg:h-[min(70dvh,40rem)]"
            pins={pins}
            selectedId={selectedId}
            onSelect={selectFromMap}
          />
        </div>

        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-1">
          <div
            aria-label={t('flow.screen.review.filterLabel')}
            className="flex gap-2"
            role="group"
          >
            {(
              [
                ['toCheck', 'filterToCheck', all.toCheckCount],
                ['all', 'filterAll', all.stopCount],
              ] as const
            ).map(([value, key, count]) => (
              <button
                aria-pressed={filter === value}
                className={cn(
                  'min-h-11 flex-1 rounded-full border px-4 text-sm font-semibold',
                  filter === value
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background',
                )}
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value)
                }}
              >
                {t(`flow.review.${key}`, { count })}
              </button>
            ))}
          </div>
          <div
            aria-label={t('flow.screen.review.stopsList')}
            className="space-y-2"
            role="group"
          >
            {shown.cards.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
                {filter === 'toCheck'
                  ? t('flow.screen.review.emptyToCheck')
                  : t('flow.screen.review.noStopsDay')}
              </p>
            ) : (
              shown.cards.map(renderCard)
            )}
          </div>
          {all.unassigned.media + all.unassigned.copies > 0 ? (
            <button
              aria-label={`${t('flow.review.unassignedTitle')}: ${unassignedFacts}`}
              className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 text-left"
              type="button"
              onClick={() => {
                setOverlay({ kind: 'unassigned' })
              }}
            >
              <span>
                <span className="block text-base font-semibold">
                  {t('flow.review.unassignedTitle')}
                </span>
                <span className="block text-sm text-muted">
                  {unassignedFacts}
                </span>
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <footer className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-1 space-y-2 rounded-2xl border border-border bg-background/95 p-3 shadow-soft backdrop-blur sm:bottom-0">
        {unopened > 0 ? (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            {t('flow.review.unopened', { count: unopened })}
            <button
              className="min-h-11 rounded-lg px-2 font-semibold text-primary underline"
              type="button"
              onClick={showUnopened}
            >
              {t('flow.review.show')}
            </button>
          </p>
        ) : null}
        <button
          className={cn(buttonVariants({ variant: 'primary' }), 'w-full')}
          type="button"
          onClick={confirmAll}
        >
          {busy ? t('flow.screen.review.confirming') : t('flow.review.confirm')}
        </button>
        <p className="text-center text-xs text-muted">
          {t('flow.review.confirmHint', { count: all.stopCount })}
        </p>
      </footer>

      {overlay === null ? null : (
        <ReviewOverlays
          actions={actions}
          day={day}
          journeyId={journeyId}
          lookup={lookup}
          moveStops={moveStops}
          overlay={overlay}
          run={run}
          setOverlay={setOverlay}
          stop={overlayStop}
        />
      )}
    </div>
  )
}
