import { useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  afterKeep,
  afterTrash,
  challengerPosition,
  startDuel,
  stepChallenger,
  type Duel,
} from '@/features/journey-flow/model/compare-duel'
import type {
  PhotoState,
  SessionPhoto,
} from '@/features/journey-flow/model/sort-session'
import { DuelCandidates } from '@/features/journey-flow/ui/sort/DuelCandidates'
import {
  DuelHeader,
  DuelZoom,
} from '@/features/journey-flow/ui/sort/DuelHeader'
import {
  DuelPane,
  type DuelRole,
} from '@/features/journey-flow/ui/sort/DuelPane'
import { ShortcutsHint } from '@/features/journey-flow/ui/sort/ShortcutsHint'
import { ShowControlsButton } from '@/features/journey-flow/ui/sort/ShowControlsButton'
import { useChrome } from '@/features/journey-flow/ui/sort/use-chrome'
import {
  useDuelKeys,
  useLayerFocus,
} from '@/features/journey-flow/ui/sort/use-duel-keys'
import { relativeSharpness } from '@/features/media-batch/model/series'
import { usePhotoCompare } from '@/features/media-batch/ui/use-photo-compare'
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
  /** Opens straight in full screen (F in the series). */
  startFullscreen?: boolean
  starred: (id: string) => boolean
  states: ReadonlyMap<string, PhotoState>
  winnerId: string
}

/**
 * Porovnání (M-Porovnani, W-Serie, M-PorovnaniCela): the kept photo stays,
 * challengers come by swiping or with [ ]; a swipe up stars the photo it
 * is on; "Nechat tuhle" under each. Swipe left = next challenger, right =
 * the previous one (like the sorting screen). Synchronous zoom Celá ·
 * 100 % · 200 %. Tab or the swap button swaps the sides.
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
  startFullscreen = false,
  starred,
  states,
  winnerId,
}: CompareDuelProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  useLayerFocus(rootRef)
  const order = useMemo(() => photos.map((p) => p.item.id), [photos])
  const [duel, setDuel] = useState<Duel>(() =>
    startDuel(order, winnerId, states, challengerId),
  )
  const [hovered, setHovered] = useState<DuelRole | null>(null)
  const [fullscreen, setFullscreen] = useState(startFullscreen)
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
  useDuelKeys({
    compare,
    fullscreen,
    hovered,
    keep,
    onClose,
    onUndo,
    setFullscreen,
    star,
    step,
    trash,
  })

  if (winner === undefined) return null
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
      onPointerMove={chrome.onPointerMove}
    >
      {chrome.visible ? (
        <DuelHeader
          backLabel={backLabel}
          canSwap={challenger !== undefined}
          canUndo={canUndo}
          compare={compare}
          fullscreen={fullscreen}
          subtitle={
            challenger === undefined
              ? t('flow.duel.noChallenger')
              : t('flow.duel.subtitle', challengerPosition(order, duel))
          }
          titleId={titleId}
          onClose={onClose}
          onFullscreen={() => {
            setFullscreen((value) => !value)
          }}
          onUndo={onUndo}
        />
      ) : (
        <h2 className="sr-only" id={titleId}>
          {t('flow.duel.title')}
        </h2>
      )}
      {fullscreen ? null : <DuelZoom compare={compare} />}

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
            onHover={(inside) => {
              setHovered(inside ? role : null)
            }}
            onKeep={() => {
              keep(role)
            }}
            onStar={() => {
              star(role)
            }}
            onSwipe={(direction) => {
              if (direction === 'up') star(role)
              else if (direction === 'left') step(1)
              else if (direction === 'right') step(-1)
            }}
            {...(fullscreen ? { onTap: chrome.toggle } : {})}
            onTrash={() => {
              trash(role)
            }}
          />
        ))}
      </div>

      {fullscreen && !chrome.visible ? (
        <ShowControlsButton onShow={chrome.show} />
      ) : null}
      {chrome.visible ? (
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
              <DuelCandidates
                baseUrl={baseUrl}
                duel={duel}
                order={order}
                photos={byId}
                states={states}
                onPick={(id) => {
                  if (id === duel.winnerId || states.get(id) === 'trash') return
                  setDuel({ ...duel, challengerId: id })
                }}
              />
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
