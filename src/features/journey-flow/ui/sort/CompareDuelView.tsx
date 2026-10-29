import { ChevronLeft, Maximize, Undo2, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  afterKeep,
  afterTrash,
  candidateStatus,
  challengerPosition,
  startDuel,
  stepChallenger,
  type Duel,
} from '@/features/journey-flow/model/compare-duel'
import type {
  PhotoState,
  SessionPhoto,
} from '@/features/journey-flow/model/sort-session'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import { FIT_VIEW, ZOOM_LEVELS } from '@/features/media-batch/model/zoom'
import { relativeSharpness } from '@/features/media-batch/model/series'
import { ignoredKey } from '@/features/media-batch/ui/sort-keys'
import { usePhotoCompare } from '@/features/media-batch/ui/use-photo-compare'
import {
  DuelPane,
  type DuelRole,
} from '@/features/journey-flow/ui/sort/DuelPane'
import { ShortcutsHint } from '@/features/journey-flow/ui/sort/ShortcutsHint'
import { useChrome } from '@/features/journey-flow/ui/sort/use-chrome'
import { cn } from '@/shared/lib/cn'

export interface CompareDuelProps {
  backLabel: string
  baseUrl: string
  canUndo: boolean
  /** Opens with this challenger when usable (the series' second pick). */
  challengerId?: string | null
  onClose: () => void
  onKeep: (id: string) => void
  onStar: (id: string) => void
  onTrash: (id: string) => void
  onUndo: () => void
  /** Candidates in capture order. */
  photos: readonly SessionPhoto[]
  starred: (id: string) => boolean
  states: ReadonlyMap<string, PhotoState>
  winnerId: string
}

const HEAD_BTN =
  'flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-40'

/**
 * Porovnání (M-Porovnani, W-Serie, M-PorovnaniCela): the kept photo stays,
 * challengers come by swiping sideways or with [ ], a swipe up trashes the
 * photo it is on, "Nechat tuhle" under each. Synchronous zoom Celá · 100 %
 * · 200 %. No swap button: Tab swaps the sides on a keyboard.
 */
export function CompareDuelView({
  backLabel,
  baseUrl,
  canUndo,
  challengerId = null,
  onClose,
  onKeep,
  onStar,
  onTrash,
  onUndo,
  photos,
  starred,
  states,
  winnerId,
}: CompareDuelProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const order = useMemo(() => photos.map((p) => p.item.id), [photos])
  const [duel, setDuel] = useState<Duel>(() =>
    startDuel(order, winnerId, states, challengerId),
  )
  const [hovered, setHovered] = useState<DuelRole | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const chrome = useChrome(fullscreen)
  const byId = new Map(photos.map((p) => [p.item.id, p]))
  const winner = byId.get(duel.winnerId)
  const challenger =
    duel.challengerId === null ? undefined : byId.get(duel.challengerId)
  // The challenger is the only partner: the shared zoom follows the duel.
  const pool = challenger === undefined ? [] : [challenger.item]
  const compare = usePhotoCompare(winner?.item, pool, { alwaysOn: true })
  const sharpness = useMemo(
    () => relativeSharpness(photos.map((p) => p.item)),
    [photos],
  )
  const position = challengerPosition(order, duel)

  const idOf = (role: DuelRole) =>
    role === 'winner' ? duel.winnerId : duel.challengerId
  const keep = (role: DuelRole) => {
    const id = idOf(role)
    if (id === null) return
    onKeep(id)
    setDuel(afterKeep(order, duel, new Map(states).set(id, 'keep'), id))
  }
  const trash = (role: DuelRole) => {
    const id = idOf(role)
    if (id === null) return
    onTrash(id)
    setDuel(afterTrash(order, duel, new Map(states).set(id, 'trash'), id))
  }
  const star = (role: DuelRole) => {
    const id = idOf(role)
    if (id !== null) onStar(id)
  }
  const step = (delta: 1 | -1) => {
    const next = stepChallenger(order, duel, states, delta)
    if (next !== null) setDuel({ ...duel, challengerId: next })
  }
  const pick = (id: string) => {
    if (id === duel.winnerId || states.get(id) === 'trash') return
    setDuel({ ...duel, challengerId: id })
  }
  const swipeOn = (role: DuelRole) => (direction: string) => {
    if (direction === 'up') trash(role)
    else if (direction === 'left') step(1)
    else if (direction === 'right') step(-1)
  }

  const latest = useRef({
    chrome,
    compare,
    fullscreen,
    keep,
    onClose,
    onUndo,
    star,
    step,
    trash,
    hovered,
  })
  useEffect(() => {
    latest.current = {
      chrome,
      compare,
      fullscreen,
      hovered,
      keep,
      onClose,
      onUndo,
      star,
      step,
      trash,
    }
  })
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
    function onKeyDown(event: KeyboardEvent) {
      if (ignoredKey(event)) return
      const now = latest.current
      const under = now.hovered ?? 'challenger'
      const run = (fn: () => void) => {
        event.preventDefault()
        if (!event.repeat) fn()
      }
      switch (event.key) {
        case '[':
        case ']':
          run(() => {
            now.step(event.key === ']' ? 1 : -1)
          })
          return
        case '+':
        case '=':
          run(now.compare.cycle)
          return
        case 'n':
        case 'N':
          run(() => {
            now.keep(under)
          })
          return
        case 'k':
        case 'K':
          run(() => {
            now.trash(under)
          })
          return
        case 's':
        case 'S':
          run(() => {
            now.star(now.hovered ?? 'winner')
          })
          return
        case 'z':
        case 'Z':
          run(now.onUndo)
          return
        case 'f':
        case 'F':
          run(() => {
            setFullscreen((value) => !value)
          })
          return
        case 'Tab':
          if (now.compare.handleKey(event)) event.preventDefault()
          return
        case 'Escape':
          event.preventDefault()
          if (now.compare.zoomed) now.compare.setZoom(() => FIT_VIEW)
          else if (now.fullscreen) setFullscreen(false)
          else now.onClose()
          return
        default:
          return
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  if (winner === undefined) return null
  const showChrome = !fullscreen || chrome.visible
  const panes: { photo: SessionPhoto; role: DuelRole }[] = [
    { photo: winner, role: 'winner' },
    ...(challenger === undefined
      ? []
      : [{ photo: challenger, role: 'challenger' as const }]),
  ]
  if (compare.swapped) panes.reverse()

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="absolute inset-0 z-30 flex flex-col bg-black text-white outline-none"
      data-testid="compare-duel"
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
      onMouseMove={chrome.poke}
    >
      {showChrome ? (
        <div
          className={cn(
            'flex shrink-0 items-center gap-1 px-1 pt-[max(0.375rem,env(safe-area-inset-top))]',
            fullscreen && 'absolute inset-x-0 top-0 z-10 bg-black/70',
          )}
        >
          <button
            aria-label={backLabel}
            className={HEAD_BTN}
            type="button"
            onClick={onClose}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold" id={titleId}>
              {t('flow.duel.title')}
            </h2>
            <p className="truncate text-xs text-white/70">
              {challenger === undefined
                ? t('flow.duel.noChallenger')
                : t('flow.duel.subtitle', position)}
            </p>
          </div>
          <button
            aria-label={t('flow.sort.back')}
            className={HEAD_BTN}
            disabled={!canUndo}
            type="button"
            onClick={onUndo}
          >
            <Undo2 aria-hidden="true" size={20} />
          </button>
          <button
            aria-label={
              fullscreen
                ? t('flow.sort.fullscreenExit')
                : t('flow.sort.fullscreen')
            }
            aria-pressed={fullscreen}
            className={HEAD_BTN}
            type="button"
            onClick={() => {
              setFullscreen((value) => !value)
            }}
          >
            {fullscreen ? (
              <X aria-hidden="true" size={20} />
            ) : (
              <Maximize aria-hidden="true" size={20} />
            )}
          </button>
        </div>
      ) : null}

      {fullscreen ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2 px-3 py-1.5">
          <div
            aria-label={t('flow.duel.zoomLabel')}
            className="flex rounded-xl bg-white/10 p-0.5"
            role="group"
          >
            {ZOOM_LEVELS.map((level) => (
              <button
                aria-pressed={compare.level === level}
                className={cn(
                  'min-h-11 min-w-14 rounded-lg px-2 text-sm font-semibold',
                  compare.level === level
                    ? 'bg-white text-black'
                    : 'text-white',
                )}
                key={String(level)}
                type="button"
                onClick={() => {
                  compare.zoomTo(level)
                }}
              >
                {level === 'fit'
                  ? t('flow.duel.zoomFit')
                  : `${String(level * 100)} %`}
              </button>
            ))}
          </div>
          <span className="text-xs text-white/70">
            {t('flow.duel.zoomHint')}
          </span>
        </div>
      )}

      <div
        className={cn(
          'grid min-h-0 flex-1 gap-2',
          fullscreen ? 'p-0' : 'px-2',
          panes.length === 2
            ? 'grid-cols-[minmax(0,1fr)] grid-rows-[repeat(2,minmax(0,1fr))] landscape:grid-cols-[repeat(2,minmax(0,1fr))] landscape:grid-rows-[minmax(0,1fr)]'
            : 'grid-rows-[minmax(0,1fr)]',
        )}
      >
        {panes.map(({ photo, role }) => (
          <DuelPane
            api={compare}
            bare={fullscreen}
            baseUrl={baseUrl}
            hint={photo.trashHint}
            item={photo.item}
            key={photo.item.id}
            kept={states.get(photo.item.id) === 'keep'}
            role={role}
            sharpness={sharpness}
            starred={starred(photo.item.id)}
            onHover={() => {
              setHovered(role)
            }}
            onKeep={() => {
              keep(role)
            }}
            onStar={() => {
              star(role)
            }}
            onSwipe={swipeOn(role)}
            {...(fullscreen ? { onTap: chrome.toggle } : {})}
            onTrash={() => {
              trash(role)
            }}
          />
        ))}
      </div>

      {showChrome ? (
        <div
          className={cn(
            'shrink-0 space-y-1.5 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5',
            fullscreen && 'absolute inset-x-0 bottom-0 bg-black/70',
          )}
        >
          {fullscreen ? (
            <p className="text-center text-xs text-white/70">
              {t('flow.duel.fullscreenHint')}
            </p>
          ) : (
            <>
              <ul
                aria-label={t('flow.duel.candidates')}
                className="no-scrollbar flex items-center gap-1 overflow-x-auto"
              >
                <li
                  aria-hidden="true"
                  className="shrink-0 pr-1 text-xs text-white/70"
                >
                  {t('flow.duel.candidates')}
                </li>
                {[
                  duel.winnerId,
                  ...order.filter((id) => id !== duel.winnerId),
                ].map((id, index) => {
                  const photo = byId.get(id)
                  if (photo === undefined) return null
                  const status = candidateStatus(id, duel, states)
                  return (
                    <li className="shrink-0" key={id}>
                      <button
                        aria-current={status === 'current' ? 'true' : undefined}
                        aria-label={t(`flow.duel.candidate.${status}`, {
                          n: index,
                        })}
                        className={cn(
                          'relative flex size-11 items-center justify-center rounded-md',
                          (status === 'current' || status === 'winner') &&
                            'outline outline-2 outline-white',
                          status === 'trash' && 'opacity-40',
                        )}
                        type="button"
                        onClick={() => {
                          pick(id)
                        }}
                      >
                        <MediaThumb
                          baseUrl={baseUrl}
                          className="size-9"
                          item={photo.item}
                        />
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-white/70 [@media(hover:hover)_and_(pointer:fine)]:hidden">
                {t('flow.duel.hint')}
              </p>
              <ShortcutsHint
                keys={[
                  'keep',
                  'trash',
                  'star',
                  'partner',
                  'swap',
                  'zoom',
                  'fullscreen',
                  'undo',
                  'close',
                ]}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
