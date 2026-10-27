import { Lock, MoreHorizontal } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { StopCard } from '@/features/journey-flow/model/stop-review'
import { joinFacts, timeFactText } from '@/features/journey-flow/ui/flow-format'
import {
  BASE_URL,
  countsText,
  stopNameText,
} from '@/features/journey-workspace/lib/moment-labels'
import { getThumbUrl } from '@/features/journey-workspace/lib/media-thumb'
import { cn } from '@/shared/lib/cn'

const STRIP_MAX = 5
const MENU_ITEM =
  'flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-sunk disabled:opacity-50'

export type StopMenuAction = 'merge' | 'move' | 'rename' | 'split'

/**
 * One stop of the day: number, name (or the skeleton while the place is
 * looked up), time fact, plain hints, photo strip and a menu of touch-sized
 * actions. The stop is selected by tapping its head (map follows).
 */
export function StopCardView({
  busy,
  canMerge,
  card,
  menuOpen,
  onAction,
  onMenu,
  onSelect,
  selected,
}: {
  busy: boolean
  canMerge: boolean
  card: StopCard
  menuOpen: boolean
  onAction: (action: StopMenuAction) => void
  onMenu: (open: boolean) => void
  onSelect: () => void
  selected: boolean
}) {
  const { i18n, t } = useTranslation()
  const menuId = useId()
  const { stop } = card
  const name = stopNameText(stop.name, t, i18n.language)
  const hints = stop.confidence.reasons.map((reason) =>
    t(`flow.review.reasons.${reason}`),
  )
  const count = stop.media.length
  const visible = stop.media.slice(0, STRIP_MAX)
  const more = count - visible.length
  const counts = countsText(t, {
    photos: stop.photoCount,
    videos: stop.videoCount,
  })

  return (
    <article
      aria-label={t('flow.screen.review.number', { number: card.number })}
      className={cn(
        'rounded-xl border bg-background p-3',
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
      )}
      data-stop-id={stop.id}
    >
      <div className="flex items-start gap-2">
        <button
          aria-pressed={selected}
          className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-lg text-left"
          type="button"
          onClick={onSelect}
        >
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          >
            {card.number}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {name.pending ? (
                <span
                  className="inline-block animate-pulse rounded bg-sunk px-2 text-sm font-semibold text-muted"
                  data-testid="stop-skeleton"
                >
                  {name.text}
                </span>
              ) : (
                <span className="text-base font-semibold break-words">
                  {name.text}
                </span>
              )}
              {stop.isNew ? (
                <span className="rounded-full bg-primary-soft px-2 text-xs font-semibold text-primary">
                  {t('flow.review.newBadge')}
                </span>
              ) : null}
              {stop.locked ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Lock
                    aria-label={t('flow.screen.review.locked')}
                    role="img"
                    size={14}
                  />
                  {t('flow.review.editedBadge')}
                </span>
              ) : null}
              {stop.needsLook ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-strong">
                  <span
                    aria-label={t('flow.screen.review.uncertain')}
                    className="size-2.5 rounded-full bg-amber-500"
                    role="img"
                  />
                  {t('flow.review.checkBadge')}
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block text-sm text-muted">
              {joinFacts([timeFactText(t, i18n.language, card.time), counts])}
            </span>
            {hints.length > 0 && !stop.locked ? (
              <span className="mt-0.5 block text-xs text-muted">
                {hints.join(' · ')}
              </span>
            ) : null}
          </span>
        </button>
        <button
          aria-controls={menuId}
          aria-expanded={menuOpen}
          aria-label={t('flow.screen.review.menuLabel', { name: name.text })}
          className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-sunk"
          disabled={busy}
          type="button"
          onClick={() => {
            onMenu(!menuOpen)
          }}
        >
          <MoreHorizontal aria-hidden="true" size={20} />
        </button>
      </div>
      {visible.length > 0 ? (
        <ul
          aria-label={t('flow.screen.review.photoStrip')}
          className="mt-2 flex gap-1 overflow-hidden"
        >
          {visible.map((item) => {
            const url = getThumbUrl(item, BASE_URL)
            return (
              <li
                className="size-14 shrink-0 overflow-hidden rounded-md bg-sunk"
                key={item.id}
              >
                {url === null ? null : (
                  <img
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                    src={url}
                  />
                )}
              </li>
            )
          })}
          {more > 0 ? (
            <li className="grid size-14 shrink-0 place-items-center rounded-md bg-sunk text-sm font-semibold text-muted">
              {t('flow.screen.review.moreCount', { count: more })}
            </li>
          ) : null}
        </ul>
      ) : null}
      {menuOpen ? (
        <div
          className="mt-2 border-t border-border pt-2"
          id={menuId}
          role="group"
          aria-label={t('flow.screen.review.menuLabel', { name: name.text })}
        >
          <button
            className={MENU_ITEM}
            disabled={busy || !canMerge}
            title={canMerge ? undefined : t('flow.screen.review.firstStop')}
            type="button"
            onClick={() => {
              onAction('merge')
            }}
          >
            {t('flow.review.mergePrevious')}
          </button>
          <button
            className={MENU_ITEM}
            disabled={busy || count < 2}
            type="button"
            onClick={() => {
              onAction('split')
            }}
          >
            {t('flow.review.split')}
          </button>
          <button
            className={MENU_ITEM}
            disabled={busy}
            type="button"
            onClick={() => {
              onAction('rename')
            }}
          >
            {t('flow.review.rename')}
          </button>
          <button
            className={MENU_ITEM}
            disabled={busy || count === 0}
            type="button"
            onClick={() => {
              onAction('move')
            }}
          >
            {t('flow.review.movePhotos')}
          </button>
          <p className="px-3 pt-1 text-xs text-muted">
            {t('flow.review.locksHint')}
          </p>
        </div>
      ) : null}
    </article>
  )
}
