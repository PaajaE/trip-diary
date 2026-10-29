import { ChevronLeft, Undo2 } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  initialKeep,
  seriesNote,
  seriesOutcome,
  seriesStates,
} from '@/features/journey-flow/model/series-pick'
import type { SessionPhoto } from '@/features/journey-flow/model/sort-session'
import { CompareDuelView } from '@/features/journey-flow/ui/sort/CompareDuelView'
import { SeriesGridItem } from '@/features/journey-flow/ui/sort/SeriesGridItem'
import { ShortcutsHint } from '@/features/journey-flow/ui/sort/ShortcutsHint'
import { useLayerFocus } from '@/features/journey-flow/ui/sort/use-duel-keys'
import { relativeSharpness } from '@/features/media-batch/model/series'
import { ignoredKey } from '@/features/media-batch/ui/sort-keys'

export interface SeriesPickProps {
  baseUrl: string
  onClose: () => void
  /** The bulk action: keep these, trash the others. */
  onSettle: (keepIds: string[], trashIds: string[]) => void
  /** ★ on or off (written at once; a ★ photo is kept). */
  onStar: (id: string) => void
  /** The series in capture order (not trashed). */
  photos: readonly SessionPhoto[]
  starred: (id: string) => boolean
  /** "5 · Mistaya Canyon · 12:14–12:15". */
  subtitle: string
}

/** One local step of the series: the marks before it, and a ★ it toggled. */
interface LocalStep {
  keep: ReadonlySet<string>
  starId: string | null
}

/**
 * Série (M-Serie, W-Serie): every photo of the series in a grid with the
 * recommended one, the kept ones and the ★ ones pre-selected to keep. The
 * mark in the corner switches nechat / koš, a tap picks a photo for
 * comparing. Nothing is trashed until "Nechávám 2 ze 7, zbylých 5 půjde do
 * koše". Undo here only takes back the steps made in the series.
 */
export function SeriesPickView({
  baseUrl,
  onClose,
  onSettle,
  onStar,
  photos,
  starred,
  subtitle,
}: SeriesPickProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  useLayerFocus(rootRef)
  const [initial] = useState(() => initialKeep(photos, starred))
  const [keep, setKeep] = useState<ReadonlySet<string>>(initial)
  const [local, setLocal] = useState<LocalStep[]>([])
  const [picks, setPicks] = useState<string[]>(() => {
    const first =
      photos.find((p) => p.recommended)?.item.id ?? photos[0]?.item.id
    const second = photos.find((p) => p.item.id !== first)?.item.id
    return [first, second].filter((id): id is string => id !== undefined)
  })
  const [comparing, setComparing] = useState<'off' | 'on' | 'fullscreen'>('off')
  const sharpness = useMemo(
    () => relativeSharpness(photos.map((p) => p.item)),
    [photos],
  )
  // A ★ photo is always kept (also a ★ given right here).
  const kept = new Set([
    ...keep,
    ...photos.filter((p) => starred(p.item.id)).map((p) => p.item.id),
  ])
  const { keepIds, trashIds } = seriesOutcome(photos, kept)
  const unchanged =
    kept.size === initial.size && [...kept].every((id) => initial.has(id))

  const change = (next: ReadonlySet<string>, starId: string | null = null) => {
    setLocal((list) => [...list, { keep, starId }])
    setKeep(next)
  }
  const markKeep = (id: string) => {
    if (!kept.has(id)) change(new Set(keep).add(id))
  }
  const markTrash = (id: string) => {
    if (starred(id) || !keep.has(id)) return
    const next = new Set(keep)
    next.delete(id)
    change(next)
  }
  const star = (id: string) => {
    onStar(id)
    change(new Set(keep).add(id), id)
  }
  const undo = () => {
    const last = local[local.length - 1]
    if (last === undefined) return
    setLocal((list) => list.slice(0, -1))
    setKeep(last.keep)
    if (last.starId !== null) onStar(last.starId)
  }
  const focused = picks[picks.length - 1] ?? photos[0]?.item.id ?? ''
  const pick = (id: string) => {
    setPicks((current) =>
      current.includes(id)
        ? current.filter((own) => own !== id)
        : [...current, id].slice(-2),
    )
  }
  const moveFocus = (delta: 1 | -1) => {
    const at = photos.findIndex((p) => p.item.id === focused)
    const next = photos[(at + delta + photos.length) % photos.length]?.item.id
    if (next !== undefined)
      setPicks((current) => [...current.slice(0, -1), next].slice(-2))
  }
  const [first, second] = picks

  const latest = useRef({
    comparing,
    focused,
    markKeep,
    markTrash,
    moveFocus,
    onClose,
    star,
    undo,
    first,
    second,
  })
  useEffect(() => {
    latest.current = {
      comparing,
      first,
      focused,
      markKeep,
      markTrash,
      moveFocus,
      onClose,
      second,
      star,
      undo,
    }
  })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const now = latest.current
      if (ignoredKey(event) || now.comparing !== 'off') return
      const run = (fn: () => void) => {
        event.preventDefault()
        if (!event.repeat) fn()
      }
      const canCompare = now.first !== undefined && now.second !== undefined
      switch (event.key) {
        case 'Escape':
          run(now.onClose)
          return
        case 'n':
        case 'N':
          run(() => {
            now.markKeep(now.focused)
          })
          return
        case 'k':
        case 'K':
          run(() => {
            now.markTrash(now.focused)
          })
          return
        case 's':
        case 'S':
          run(() => {
            now.star(now.focused)
          })
          return
        case 'z':
        case 'Z':
          run(now.undo)
          return
        case '[':
        case ']':
          run(() => {
            now.moveFocus(event.key === ']' ? 1 : -1)
          })
          return
        case '+':
        case '=':
        case 'c':
        case 'C':
          if (canCompare)
            run(() => {
              setComparing('on')
            })
          return
        case 'f':
        case 'F':
          if (canCompare)
            run(() => {
              setComparing('fullscreen')
            })
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

  const bulkLabel =
    trashIds.length === 0
      ? t('flow.seriesPick.keepAll', { count: keepIds.length })
      : unchanged && keepIds.length === 1
        ? t('flow.seriesPick.keepRecommended')
        : t('flow.seriesPick.bulk', {
            count: trashIds.length,
            keep: keepIds.length,
            total: photos.length,
          })

  return (
    <div
      aria-labelledby={titleId}
      aria-modal="true"
      className="absolute inset-0 z-20 flex flex-col bg-black text-white outline-none"
      data-testid="series-pick"
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
    >
      <div className="flex min-h-0 flex-1 flex-col" inert={comparing !== 'off'}>
        <div className="flex shrink-0 items-center gap-1 px-1 pt-[max(0.375rem,env(safe-area-inset-top))]">
          <button
            aria-label={t('flow.seriesPick.back')}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10"
            type="button"
            onClick={onClose}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold" id={titleId}>
              {t('flow.seriesPick.title', { count: photos.length })}
            </h2>
            <p className="truncate text-xs text-white/70">{subtitle}</p>
          </div>
          <button
            aria-label={t('flow.seriesPick.undo')}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-40"
            disabled={local.length === 0}
            type="button"
            onClick={undo}
          >
            <Undo2 aria-hidden="true" size={20} />
          </button>
        </div>
        <p className="shrink-0 px-4 py-1.5 text-xs text-white/75">
          {t('flow.seriesPick.intro')}
        </p>
        <ul
          aria-label={t('flow.seriesPick.title', { count: photos.length })}
          className="grid min-h-0 w-full flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(min(7.5rem,100%),1fr))] gap-2 overflow-y-auto px-3 py-1 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] lg:mx-auto lg:max-w-6xl lg:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] lg:gap-3"
        >
          {photos.map((photo) => {
            const id = photo.item.id
            const isStarred = starred(id)
            return (
              <SeriesGridItem
                baseUrl={baseUrl}
                key={id}
                kept={kept.has(id)}
                note={seriesNote(photo, sharpness)}
                photo={photo}
                pickedAs={picks.indexOf(id) + 1}
                starred={isStarred}
                onPick={() => {
                  pick(id)
                }}
                onToggle={() => {
                  if (kept.has(id)) markTrash(id)
                  else markKeep(id)
                }}
              />
            )
          })}
        </ul>
        <div className="shrink-0 space-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <p className="text-xs text-white/70">
            {t('flow.seriesPick.footnote')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="flex min-h-12 items-center justify-center rounded-2xl bg-white/10 px-4 text-sm font-semibold hover:bg-white/20 disabled:opacity-40"
              disabled={first === undefined || second === undefined}
              type="button"
              onClick={() => {
                setComparing('on')
              }}
            >
              {t('flow.seriesPick.compare')}
            </button>
            <button
              className="flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-action-keep px-4 text-base font-bold text-action-keep-foreground hover:bg-action-keep-hover disabled:opacity-40"
              disabled={keepIds.length === 0}
              type="button"
              onClick={() => {
                onSettle(keepIds, trashIds)
              }}
            >
              {bulkLabel}
            </button>
          </div>
          <ShortcutsHint
            keys={[
              'keep',
              'trash',
              'star',
              'partner',
              'compare',
              'zoom',
              'fullscreen',
              'undo',
              'close',
            ]}
          />
        </div>
      </div>

      {comparing !== 'off' && first !== undefined ? (
        <CompareDuelView
          backLabel={t('flow.duel.backToSeries')}
          baseUrl={baseUrl}
          canUndo={local.length > 0}
          challengerId={second ?? null}
          photos={photos}
          startFullscreen={comparing === 'fullscreen'}
          starred={starred}
          states={seriesStates(photos, kept)}
          winnerId={first}
          onClose={() => {
            setComparing('off')
          }}
          onKeep={markKeep}
          onStar={star}
          onTrash={markTrash}
          onUndo={undo}
        />
      ) : null}
    </div>
  )
}
