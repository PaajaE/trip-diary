import { Check, Play, Star } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { Moment } from '@/entities/moment/model/moment'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { formatLocalTime } from '@/features/journey-workspace/lib/format-range'
import { normalizeBody } from '@/features/journey-workspace/lib/text-edit'
import type { WorkspaceMoment } from '@/features/journey-workspace/model/workspace-tree'
import type { DayStop } from '@/features/journey-workspace/model/day-stops'
import type { DaySelection } from '@/features/journey-workspace/ui/day/use-day-selection'
import {
  aspectOf,
  HERO_VARIANTS,
  TILE_VARIANTS,
  variantUrl,
} from '@/features/journey-workspace/ui/day/media-url'
import { stopElementId } from '@/features/journey-workspace/ui/day/ids'
import { cn } from '@/shared/lib/cn'

interface PhotoTileProps {
  baseUrl: string
  hero: boolean
  item: MediaItem
  onActivate: (item: MediaItem, event: React.MouseEvent<HTMLElement>) => void
  selected: boolean
  selecting: boolean
  onToggle: (item: MediaItem, range: boolean) => void
}

function PhotoTile({
  baseUrl,
  hero,
  item,
  onActivate,
  onToggle,
  selected,
  selecting,
}: PhotoTileProps) {
  const { t } = useTranslation()
  const url = variantUrl(item, hero ? HERO_VARIANTS : TILE_VARIANTS, baseUrl)
  // Hero: never lower than 4:3 or wider than 16:9, and never full row width.
  const ratio = hero ? aspectOf(item, 4 / 3, 16 / 9) : aspectOf(item)
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-md bg-sunk',
        hero
          ? 'col-span-3 aspect-[var(--r)] min-[760px]:w-[min(100%,36rem)]'
          : 'aspect-square min-[760px]:aspect-auto min-[760px]:h-[130px] min-[760px]:basis-[calc(var(--r)*130px)] min-[760px]:grow-[var(--r)]',
        selected && 'ring-2 ring-primary ring-offset-1',
      )}
      data-selected={selected ? 'true' : undefined}
      data-testid="day-photo"
      style={{ '--r': ratio } as React.CSSProperties}
    >
      <button
        aria-label={item.caption ?? t('viewer.open')}
        className={cn(
          'block h-full w-full',
          selecting ? 'cursor-pointer' : 'cursor-zoom-in',
        )}
        type="button"
        onClick={(event) => {
          onActivate(item, event)
        }}
      >
        {url !== null ? (
          <img
            alt={item.caption ?? ''}
            className={cn(
              'h-full w-full object-cover transition-opacity',
              selected && 'opacity-80',
            )}
            decoding="async"
            loading="lazy"
            src={url}
          />
        ) : null}
      </button>
      {item.kind === 'video' ? (
        <span
          aria-label={t('workspace.video')}
          className="pointer-events-none absolute bottom-1 left-1 inline-flex items-center rounded-full bg-black/60 p-1 text-white"
        >
          <Play aria-hidden="true" size={12} />
        </span>
      ) : null}
      {item.starred ? (
        <Star
          aria-label={t('workspace.starred')}
          className="pointer-events-none absolute right-1.5 top-1 fill-white text-white drop-shadow"
          data-testid="day-photo-star"
          size={15}
        />
      ) : null}
      {/* The button is a 44x44 hit area in the tile corner; the visible circle is smaller. */}
      <button
        aria-label={t('dayDetail.selectPhoto')}
        aria-pressed={selected}
        className={cn(
          'absolute left-0 top-0 inline-flex size-11 items-center justify-center transition-opacity',
          selecting || selected
            ? 'opacity-100'
            : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-70',
        )}
        type="button"
        onClick={(event) => {
          onToggle(item, event.shiftKey)
        }}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-full border-2 border-white bg-black/35 text-white min-[760px]:size-7',
            selected && 'border-primary bg-primary',
          )}
        >
          {selected ? <Check size={14} /> : null}
        </span>
      </button>
    </div>
  )
}

function focusOnMount(el: HTMLTextAreaElement | null): void {
  el?.focus()
}

function MomentText({
  canEdit,
  edits,
  moment,
}: {
  canEdit: boolean
  edits: WorkspaceEdits
  moment: Moment
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(null)

  function finish(save: boolean): void {
    const raw = draft
    setDraft(null)
    if (!save || raw === null) return
    const result = normalizeBody(raw)
    if (!result.ok || result.value === moment.body) return
    void edits.saveMomentText(moment, {
      body: result.value,
      title: moment.title,
    })
  }

  if (draft !== null) {
    return (
      <div className="mt-2.5">
        <textarea
          aria-label={t('dayDetail.stopTextLabel')}
          ref={focusOnMount}
          className="min-h-20 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm"
          value={draft}
          onBlur={() => {
            finish(true)
          }}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              finish(false)
            }
          }}
        />
        <div className="mt-1.5 flex gap-2 text-sm">
          <button
            className="rounded-sm bg-primary px-3 py-1 font-medium text-primary-foreground"
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              finish(true)
            }}
          >
            {t('dayDetail.stopTextSave')}
          </button>
          <button
            className="rounded-sm px-3 py-1 text-muted"
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              finish(false)
            }}
          >
            {t('dayDetail.stopTextCancel')}
          </button>
        </div>
      </div>
    )
  }
  if (moment.body === '') {
    return canEdit ? (
      <button
        className="mt-2 text-sm text-primary"
        type="button"
        onClick={() => {
          setDraft('')
        }}
      >
        {t('dayDetail.stopAddText')}
      </button>
    ) : null
  }
  const content = (
    <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-muted">
      {moment.body}
    </p>
  )
  return canEdit ? (
    <button
      aria-label={t('dayDetail.stopTextLabel')}
      className="block w-full text-left"
      type="button"
      onClick={() => {
        setDraft(moment.body)
      }}
    >
      {content}
    </button>
  ) : (
    content
  )
}

interface DayStopsProps {
  baseUrl: string
  canEdit: boolean
  edits: WorkspaceEdits
  locale: string
  /** Flat visual order of the day's media ids (for shift-range selection). */
  mediaOrder: readonly string[]
  onOpenMedia: (item: MediaItem, trigger: HTMLElement) => void
  /** Extra controls in the stop header, e.g. the "..." menu of a moment. */
  renderStopMenu?: ((entry: WorkspaceMoment) => ReactNode) | undefined
  selection: DaySelection
  stops: readonly DayStop[]
}

export function DayStops({
  baseUrl,
  canEdit,
  edits,
  locale,
  mediaOrder,
  onOpenMedia,
  renderStopMenu,
  selection,
  stops,
}: DayStopsProps) {
  const { t } = useTranslation()
  const km = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })

  return (
    <ol className="mt-6 flex flex-col gap-5" data-testid="day-stops">
      {stops.map((stop, index) => {
        const start = formatLocalTime(stop.startsAt, stop.tz, locale)
        const end = formatLocalTime(stop.endsAt, stop.tz, locale)
        const title = stop.title ?? t('dayDetail.stopNumber', { n: index + 1 })
        const sub =
          stop.placeLabel !== null && stop.placeLabel !== stop.title
            ? stop.placeLabel
            : null
        return (
          <li className="flex flex-col gap-5" key={stop.id}>
            <article
              className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3 min-[760px]:grid-cols-[4rem_minmax(0,1fr)] min-[760px]:gap-x-3.5"
              data-testid="day-stop"
              id={stopElementId(stop.id)}
            >
              <div className="pt-0.5 text-right text-[13px] tabular-nums text-muted">
                <b className="block text-[15px] font-semibold text-foreground">
                  {start}
                </b>
                {end !== start ? `– ${end}` : null}
              </div>
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-x-1.5 text-[17px] font-semibold">
                  <span
                    aria-hidden="true"
                    className="inline-grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground"
                  >
                    {index + 1}
                  </span>
                  <span>{title}</span>
                  {sub !== null ? (
                    <small className="text-[12.5px] font-normal text-faint">
                      {sub}
                    </small>
                  ) : null}
                  {stop.photoCount + stop.videoCount > 0 ? (
                    <small className="text-[12.5px] font-normal text-faint">
                      {'· '}
                      {t('terms.photo.count', {
                        count: stop.photoCount + stop.videoCount,
                      })}
                    </small>
                  ) : null}
                  {renderStopMenu === undefined ? null : (
                    <span className="ml-auto flex items-center">
                      {stop.moments.map((entry) => (
                        <span key={entry.moment.id}>
                          {renderStopMenu(entry)}
                        </span>
                      ))}
                    </span>
                  )}
                </h3>
                {stop.media.length === 0 ? (
                  <p className="mt-2 text-sm text-faint">
                    {t('dayDetail.emptyStop')}
                  </p>
                ) : (
                  <div className="mt-2.5 grid grid-cols-3 gap-1 min-[760px]:flex min-[760px]:flex-wrap">
                    {(() => {
                      const hero = stop.hero
                      const rest =
                        hero === null
                          ? stop.media
                          : stop.media.filter((item) => item.id !== hero.id)
                      return [...(hero === null ? [] : [hero]), ...rest].map(
                        (item) => (
                          <PhotoTile
                            baseUrl={baseUrl}
                            hero={item.id === hero?.id && stop.media.length > 1}
                            item={item}
                            key={item.id}
                            selected={selection.has(item.id)}
                            selecting={selection.mode}
                            onActivate={(photo, event) => {
                              if (
                                selection.mode ||
                                event.shiftKey ||
                                event.metaKey ||
                                event.ctrlKey
                              ) {
                                selection.toggle(
                                  photo.id,
                                  mediaOrder,
                                  event.shiftKey,
                                )
                                return
                              }
                              onOpenMedia(photo, event.currentTarget)
                            }}
                            onToggle={(photo, range) => {
                              selection.toggle(photo.id, mediaOrder, range)
                            }}
                          />
                        ),
                      )
                    })()}
                  </div>
                )}
                {stop.moments.map((entry) => (
                  <MomentText
                    canEdit={canEdit}
                    edits={edits}
                    key={entry.moment.id}
                    moment={entry.moment}
                  />
                ))}
              </div>
            </article>
            {index < stops.length - 1 ? (
              <div className="flex items-center gap-2 text-xs text-faint min-[760px]:ml-[4.875rem]">
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
                <span>
                  {stop.kmToNext !== null
                    ? t('dayDetail.travel', {
                        km: km.format(Math.max(1, stop.kmToNext)),
                      })
                    : t('dayDetail.travelUnknown')}
                  {' · '}
                </span>
                {/* TODO(4c): split the day here (split_moment + day boundary). */}
                <button
                  className="font-medium text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  disabled
                  title={t('dayDetail.splitSoon')}
                  type="button"
                >
                  {t('dayDetail.splitHere')}
                </button>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </div>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
