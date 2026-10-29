import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { FlowActions } from '@/features/journey-flow/api/flow-actions'
import type { FlowDay } from '@/features/journey-flow/model/flow-days'
import {
  buildUnassigned,
  selectedOf,
  type CopyPair,
  type GroupSuggestion,
} from '@/features/journey-flow/model/unassigned'
import { formatLocalTime } from '@/features/journey-workspace/lib/format-range'
import { getThumbUrl } from '@/features/journey-workspace/lib/media-thumb'
import {
  BASE_URL,
  stopNameText,
} from '@/features/journey-workspace/lib/moment-labels'
import {
  dialogButton,
  WorkspaceDialog,
} from '@/features/journey-workspace/ui/WorkspaceDialog'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'

export type UnassignedActions = Pick<
  FlowActions,
  'assignToStop' | 'fixCopyTime' | 'keepBoth' | 'trashCopy'
>

function Thumb({ item, locale }: { item: MediaItem; locale: string }) {
  const url = getThumbUrl(item, BASE_URL)
  return (
    <span className="relative block size-full overflow-hidden rounded-lg bg-sunk">
      {url === null ? null : (
        <img alt="" className="size-full object-cover" src={url} />
      )}
      {item.capturedAt === null ? null : (
        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 text-[11px] text-white">
          {formatLocalTime(item.capturedAt, item.capturedTz, locale)}
        </span>
      )}
    </span>
  )
}

/**
 * Nezařazené (M-Nezarazene / W-Nezarazene) as a sheet: the time axis of the
 * day, one group suggestion at a time with "Zařadit všechny N" (any photo
 * can be deselected) and "Podezřelé kopie". Everything is a real button.
 */
export function UnassignedSheet({
  actions,
  day,
  journeyId,
  lookup,
  onClose,
  onElsewhere,
  run,
}: {
  actions: UnassignedActions
  day: FlowDay
  journeyId: string
  lookup: ReadonlyMap<string, MediaItem>
  onClose: () => void
  /** "Jinam…": open the "Přesunout do" sheet for these photos. */
  onElsewhere: (items: MediaItem[]) => void
  /** Runs a write, shows its error; resolves false on failure. */
  run: (action: () => Promise<unknown>) => Promise<boolean>
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const model = useMemo(() => buildUnassigned(day, lookup), [day, lookup])
  const [off, setOff] = useState<ReadonlySet<string>>(new Set())
  const byId = new Map(day.unassigned.map((item) => [item.id, item]))
  const stopName = (id: string) => {
    const stop = day.stops.find((entry) => entry.id === id)
    return stop === undefined ? '' : stopNameText(stop.name, t, locale).text
  }
  const time = (iso: string, tz: string | null = null) =>
    formatLocalTime(iso, tz, locale)
  const empty =
    model.groups.length === 0 &&
    model.rest.length === 0 &&
    model.copies.length === 0

  const toggle = (id: string) => {
    setOff((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }
  const items = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const found = byId.get(id)
      return found === undefined ? [] : [found]
    })
  const minutes = (ms: number) => Math.max(1, Math.round(Math.abs(ms) / 60_000))

  const groupView = (group: GroupSuggestion) => {
    const selected = selectedOf(group, off)
    const count = group.mediaIds.length
    return (
      <section
        aria-label={t('flow.unassigned.group', {
          count,
          from: time(group.from),
          to: time(group.to),
        })}
        className="space-y-2 rounded-xl border border-border p-3"
        key={group.stopId + group.from}
      >
        <h3 className="text-base font-semibold">
          {t('flow.unassigned.group', {
            count,
            from: time(group.from),
            to: time(group.to),
          })}
        </h3>
        <p className="text-sm text-muted">
          {[
            t('flow.unassigned.likely', {
              name: stopName(group.stopId),
              number: group.stopNumber ?? '',
            }),
            group.offsetMs >= 0
              ? t('flow.unassigned.startsLater', {
                  minutes: minutes(group.offsetMs),
                })
              : t('flow.unassigned.startedEarlier', {
                  minutes: minutes(group.offsetMs),
                }),
          ].join(', ')}
        </p>
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {group.mediaIds.map((id) => {
            const item = byId.get(id)
            if (item === undefined) return null
            const on = !off.has(id)
            return (
              <li className="aspect-square" key={id}>
                <button
                  aria-label={t('flow.screen.unassigned.photoToggle', {
                    time:
                      item.capturedAt === null
                        ? ''
                        : time(item.capturedAt, item.capturedTz),
                  })}
                  aria-pressed={on}
                  className={cn(
                    'block size-full min-h-11 rounded-lg',
                    on ? 'ring-4 ring-primary' : 'opacity-50',
                  )}
                  type="button"
                  onClick={() => {
                    toggle(id)
                  }}
                >
                  <Thumb item={item} locale={locale} />
                </button>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted">
          {t('flow.unassigned.deselectHint')}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonVariants({ variant: 'primary' })}
            disabled={selected.length === 0}
            type="button"
            onClick={() => {
              run(() => actions.assignToStop(selected, group.stopId)).catch(
                () => undefined,
              )
            }}
          >
            {t('flow.unassigned.assignAll', { count: selected.length })}
          </button>
          <button
            className={buttonVariants({ variant: 'secondary' })}
            disabled={selected.length === 0}
            type="button"
            onClick={() => {
              onElsewhere(items(selected))
            }}
          >
            {t('flow.unassigned.elsewhere')}
          </button>
        </div>
      </section>
    )
  }

  const figure = (item: MediaItem, kind: 'copy' | 'original') => (
    <figure className="w-24">
      <div className="aspect-square">
        <Thumb item={item} locale={locale} />
      </div>
      <figcaption className="mt-1 text-xs text-muted">
        {t(`flow.unassigned.${kind}`, {
          time:
            item.capturedAt === null
              ? ''
              : time(item.capturedAt, item.capturedTz),
        })}
      </figcaption>
    </figure>
  )

  const copyView = (pair: CopyPair) => {
    const hours = Math.round((Math.abs(pair.offsetSeconds) / 3600) * 10) / 10
    return (
      <li
        className="space-y-2 rounded-xl border border-border p-3"
        key={pair.copy.id}
      >
        <div className="flex gap-3">
          {figure(pair.original, 'original')}
          {figure(pair.copy, 'copy')}
        </div>
        <p className="text-sm text-muted">
          {t('flow.unassigned.copyFacts', { hours })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={buttonVariants({ variant: 'primary' })}
            type="button"
            onClick={() => {
              run(() => actions.trashCopy(pair.copy.id)).catch(() => undefined)
            }}
          >
            {t('flow.unassigned.trashCopy')}
          </button>
          <button
            className={buttonVariants({ variant: 'secondary' })}
            type="button"
            onClick={() => {
              run(() =>
                actions.fixCopyTime(pair.copy.id, pair.offsetSeconds),
              ).catch(() => undefined)
            }}
          >
            {t('flow.unassigned.fixTime')}
          </button>
          <button
            className={buttonVariants({ variant: 'ghost' })}
            type="button"
            onClick={() => {
              actions.keepBoth(journeyId, pair.copy.id)
            }}
          >
            {t('flow.unassigned.keepBoth')}
          </button>
        </div>
      </li>
    )
  }

  return (
    <WorkspaceDialog title={t('flow.unassigned.title')} wide onClose={onClose}>
      <p className="mt-1 text-sm text-muted">{t('flow.unassigned.intro')}</p>
      {model.axis.points.length > 0 ? (
        <div
          aria-label={t('flow.screen.unassigned.axis')}
          className="relative mt-3 h-6 rounded-full bg-sunk"
          role="img"
        >
          {model.axis.points.map((point) => (
            <span
              className={cn(
                'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full',
                point.noLocation ? 'bg-accent' : 'bg-primary',
              )}
              key={point.item.id}
              style={{ left: `${String(6 + (point.at ?? 0) * 88)}%` }}
            />
          ))}
        </div>
      ) : null}
      <div className="mt-3 space-y-3">
        {empty ? (
          <p className="text-sm text-muted">
            {t('flow.screen.unassigned.empty')}
          </p>
        ) : null}
        {model.groups.map(groupView)}
        {model.rest.length > 0 ? (
          <section className="space-y-2 rounded-xl border border-border p-3">
            <h3 className="text-base font-semibold">
              {t('flow.screen.unassigned.restTitle', {
                count: model.rest.length,
              })}
            </h3>
            <button
              className={buttonVariants({ variant: 'secondary' })}
              type="button"
              onClick={() => {
                onElsewhere(items(model.rest))
              }}
            >
              {t('flow.unassigned.elsewhere')}
            </button>
          </section>
        ) : null}
        {model.copies.length > 0 ? (
          <section>
            <h3 className="mb-2 text-base font-semibold">
              {t('flow.unassigned.copiesTitle')}
            </h3>
            <ul className="space-y-2">{model.copies.map(copyView)}</ul>
          </section>
        ) : null}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          className={`${dialogButton} bg-primary text-primary-foreground`}
          type="button"
          onClick={onClose}
        >
          {t('flow.unassigned.done')}
        </button>
      </div>
    </WorkspaceDialog>
  )
}
