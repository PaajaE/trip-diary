import { Link } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { DayEndSummary } from '@/features/journey-flow/model/day-sort'
import type { FlowDay } from '@/features/journey-flow/model/flow-days'
import { placesOf } from '@/features/journey-flow/model/intake'
import { dayHeading } from '@/features/journey-flow/ui/flow-format'
import { MiniRoute } from '@/features/journey-flow/ui/sort/MiniRoute'
import {
  formatLocalTime,
  mediaDisplayZone,
} from '@/features/journey-workspace/lib/format-range'
import { getCardUrl } from '@/features/journey-workspace/lib/media-thumb'
import { stopNameText } from '@/features/journey-workspace/lib/moment-labels'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'

export interface DayEndViewProps {
  baseUrl: string
  day: FlowDay
  journeyId: string
  onBackToSorting: () => void
  /** "Nevím kam": the photos still without a stop are placed in Kontrola. */
  onOpenReview: () => void
  summary: DayEndSummary
}

const CARD = 'rounded-2xl border border-border bg-surface p-4'

/**
 * Konec dne (M-Konec, W-Konec): what the day became (nechat · koš · ★),
 * the cover proposal from the ★ photos, a mini route, the day note, the
 * next day, and a way back to sorting.
 */
export function DayEndView({
  baseUrl,
  day,
  journeyId,
  onBackToSorting,
  onOpenReview,
  summary,
}: DayEndViewProps) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const [noteLater, setNoteLater] = useState(false)
  const [picking, setPicking] = useState(false)
  const starred = day.media.filter((m) => m.kind === 'photo' && m.starred)
  const [coverId, setCoverId] = useState(summary.coverMediaId)
  const cover =
    starred.find((m) => m.id === coverId) ??
    starred.find((m) => m.id === summary.coverMediaId)
  const coverUrl = cover === undefined ? null : getCardUrl(cover, baseUrl)
  const places = placesOf(day.stops).map(
    (name) => stopNameText(name, t, locale).text,
  )
  const route =
    places.length === 2
      ? t('flow.intake.route', { from: places[0], to: places[1] })
      : (places[0] ?? null)
  const stopsDone = t('flow.dayEnd.stopsDone', {
    done: summary.doneStops,
    total: summary.totalStops,
  })
  const heading = dayHeading(day.key, locale)
  const points = day.stops.flatMap((s) => (s.centre === null ? [] : [s.centre]))
  const timeOf = (item: MediaItem) =>
    item.capturedAt === null
      ? ''
      : formatLocalTime(item.capturedAt, mediaDisplayZone(item, null), locale)

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background text-foreground"
      data-testid="day-end"
    >
      <div className="flex shrink-0 items-center gap-1 px-1 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <Link
          aria-label={t('flow.dayEnd.back')}
          className="flex size-11 items-center justify-center rounded-xl hover:bg-surface"
          params={{ journeyId }}
          to="/j/$journeyId/flow"
        >
          <ChevronLeft aria-hidden="true" />
        </Link>
        <span className="text-sm font-semibold text-muted">{heading}</span>
      </div>
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <header className="lg:col-span-2">
          <h2 className="flex items-center gap-2.5 text-2xl font-bold">
            <span className="flex size-8 items-center justify-center rounded-full bg-action-keep text-action-keep-foreground">
              <Check aria-hidden="true" size={18} />
            </span>
            {summary.unassigned > 0
              ? t('flow.dayEnd.stopsAllDone')
              : t('flow.dayEnd.done')}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {route === null
              ? stopsDone
              : t('flow.dayEnd.facts', {
                  done: summary.doneStops,
                  places: route,
                  total: summary.totalStops,
                })}
          </p>
        </header>

        <div className="space-y-3">
          <div
            aria-label={t('flow.dayEnd.cover')}
            className="relative h-64 overflow-hidden rounded-2xl bg-sunk bg-cover bg-center lg:h-80"
            role="img"
            style={
              coverUrl === null
                ? undefined
                : { backgroundImage: `url("${coverUrl}")` }
            }
          >
            <span className="absolute bottom-3 left-3 rounded-lg bg-background px-2.5 py-1 text-xs font-semibold">
              {cover === undefined
                ? t('flow.dayEnd.noCover')
                : t('flow.dayEnd.cover')}
            </span>
          </div>
          {starred.length > 1 ? (
            <button
              aria-expanded={picking}
              className={buttonVariants({ variant: 'secondary' })}
              type="button"
              onClick={() => {
                setPicking((value) => !value)
              }}
            >
              {t('flow.dayEnd.change')}
            </button>
          ) : null}
          {picking ? (
            <div
              aria-label={t('flow.dayEnd.coverPick')}
              className="space-y-1"
              role="group"
            >
              <ul className="flex flex-wrap gap-2">
                {starred.map((item) => (
                  <li key={item.id}>
                    <button
                      aria-label={t('flow.dayEnd.coverOption', {
                        time: timeOf(item),
                      })}
                      aria-pressed={item.id === cover?.id}
                      className={cn(
                        'block rounded-md',
                        item.id === cover?.id &&
                          'outline outline-2 outline-primary',
                      )}
                      type="button"
                      onClick={() => {
                        setCoverId(item.id)
                        setPicking(false)
                      }}
                    >
                      <MediaThumb
                        baseUrl={baseUrl}
                        className="size-14"
                        item={item}
                      />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                {t('flow.dayEnd.coverPickNote')}
              </p>
            </div>
          ) : null}
          <div
            className={cn(
              CARD,
              'flex flex-wrap items-baseline gap-x-4 gap-y-1',
            )}
          >
            <span className="text-lg font-semibold">
              {t('terms.photo.count', { count: summary.total })}
            </span>
            <span className="text-sm">
              {t('flow.dayEnd.keep', { count: summary.keep })}
            </span>
            <span className="text-sm">
              {t('flow.dayEnd.trash', { count: summary.trash })}
            </span>
            <span className="text-sm">
              {t('flow.dayEnd.star', { count: summary.star })}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className={cn(CARD, 'space-y-2')}>
            <MiniRoute className="h-28 w-full" points={points} />
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Check aria-hidden="true" className="text-primary" size={16} />
              {stopsDone}
            </p>
          </div>
          {summary.unassigned > 0 ? (
            <div className={cn(CARD, 'space-y-2')}>
              <p className="text-sm">
                {t('flow.dayEnd.unassignedLeft', { count: summary.unassigned })}
              </p>
              <button
                className={buttonVariants({ variant: 'secondary' })}
                type="button"
                onClick={onOpenReview}
              >
                {t('flow.sort.dontKnowCount', { count: summary.unassigned })}
              </button>
            </div>
          ) : null}
          {noteLater ? null : (
            <div className={cn(CARD, 'space-y-3')}>
              <div>
                <h3 className="text-lg font-semibold">
                  {t('flow.dayEnd.noteTitle')}
                </h3>
                <p className="text-sm text-muted">
                  {t('flow.dayEnd.noteBody')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  className={buttonVariants({ variant: 'primary' })}
                  params={{ date: day.key, journeyId }}
                  to="/j/$journeyId/workspace/day/$date"
                >
                  {t('flow.dayEnd.writeNote')}
                </Link>
                <button
                  className={buttonVariants({ variant: 'secondary' })}
                  type="button"
                  onClick={() => {
                    setNoteLater(true)
                  }}
                >
                  {t('flow.dayEnd.later')}
                </button>
              </div>
            </div>
          )}
          {summary.nextDay === null ? (
            <p className="text-sm text-muted">{t('flow.dayEnd.lastDay')}</p>
          ) : (
            <Link
              className="flex min-h-16 items-center gap-3 rounded-2xl bg-primary px-4 text-primary-foreground hover:bg-primary/90"
              params={{ dayKey: summary.nextDay.key, journeyId }}
              to="/j/$journeyId/flow/$dayKey"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold">
                  {t('flow.dayEnd.nextDay')}
                </span>
                <span className="block text-sm opacity-90">
                  {t('flow.dayEnd.nextDayFacts', {
                    day: dayHeading(summary.nextDay.key, locale),
                    photos: t('terms.photo.count', {
                      count: summary.nextDay.photoCount,
                    }),
                  })}
                </span>
              </span>
              <ChevronRight aria-hidden="true" />
            </Link>
          )}
          <button
            className={cn(buttonVariants({ variant: 'ghost' }), 'w-full')}
            type="button"
            onClick={onBackToSorting}
          >
            {t('flow.dayEnd.backToSorting')}
          </button>
        </div>
      </div>
    </div>
  )
}
