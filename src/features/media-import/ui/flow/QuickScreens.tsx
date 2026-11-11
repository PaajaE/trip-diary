import {
  Check,
  ChevronLeft,
  Clock,
  Layers,
  MapPin,
  Star,
  Undo2,
  X,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TriageItem } from '@/entities/media/model/triage-item'
import type { ThumbnailLoader } from '@/features/media-import/api/thumbnail-loader'
import { measureSharpness } from '@/features/media-import/lib/sharpness'
import {
  relativeSharpness,
  type TriageDecision,
} from '@/features/media-import/model/triage'
import {
  formatDayHeading,
  formatTime,
} from '@/features/media-import/model/triage-format'
import {
  FlowBody,
  FlowFooter,
  FlowHeader,
  FlowScreen,
  IconButton,
  Lead,
  PrimaryButton,
  SecondaryButton,
  TextButton,
} from '@/features/media-import/ui/flow/flow-ui'
import { StatusChip, Thumb } from '@/features/media-import/ui/flow/Thumbs'
import { useThumbnailLoaders } from '@/features/media-import/ui/flow/thumbnail-context'
import { haptic } from '@/shared/lib/haptics'
import { useSwipe } from '@/features/media-batch/ui/use-swipe'
import { cn } from '@/shared/lib/cn'

const ACTION =
  'flex min-h-[66px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[15px] font-bold'

function Hint({ children }: { children: ReactNode }) {
  return <p className="px-0.5 pt-2 text-[13px] text-muted">{children}</p>
}

export function QuickScreen({
  done,
  index,
  item,
  left,
  locale,
  onClose,
  onDecide,
  onSeries,
  onUndo,
  seriesCount,
  timeZone,
  total,
  up,
  canUndo,
}: {
  canUndo: boolean
  done: boolean
  index: number
  item: TriageItem | null
  left: number
  locale: string
  onClose: () => void
  onDecide: (decision: TriageDecision) => void
  onSeries: () => void
  onUndo: () => void
  seriesCount: number
  timeZone: string
  total: number
  up: number
}) {
  const { t } = useTranslation()
  const swipe = useSwipe({
    enabled: () => item !== null && !done,
    onSwipe: (direction) => {
      if (direction === 'up') {
        haptic('light')
        onDecide('best')
      }
    },
  })
  const when =
    item?.capturedAt == null
      ? null
      : `${formatDayHeading(item.capturedAt.slice(0, 10), locale)} · ${formatTime(item.capturedAt, locale, timeZone)}`
  return (
    <FlowScreen>
      <FlowHeader
        action={
          <TextButton disabled={!canUndo} onClick={onUndo}>
            <Undo2 aria-hidden="true" size={18} />
            {t('mediaImport.flow.quick.undo')}
          </TextButton>
        }
        left={
          <IconButton
            label={t('mediaImport.flow.quick.close')}
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </IconButton>
        }
      >
        <span className="block text-center tabular-nums">
          {t('mediaImport.flow.quick.counter', {
            index: Math.min(index + 1, total),
            total,
          })}
        </span>
      </FlowHeader>
      {done || item === null ? (
        <FlowBody center>
          <div className="mx-auto mt-9 mb-3 grid size-[72px] place-items-center rounded-full bg-primary-soft text-primary">
            <Check aria-hidden="true" size={26} />
          </div>
          <h1 className="text-[26px] leading-tight font-semibold">
            {t('mediaImport.flow.quick.done')}
          </h1>
          <Lead className="mx-auto max-w-[330px]">
            {t('mediaImport.flow.quick.doneBody')}
          </Lead>
          <div className="mx-auto mt-6 max-w-[330px]">
            <PrimaryButton onClick={onClose}>
              {t('mediaImport.flow.quick.toGrid')}
            </PrimaryButton>
          </div>
        </FlowBody>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col px-4">
            <div
              aria-label={t('mediaImport.flow.quick.photoLabel', {
                index: index + 1,
                total,
              })}
              className="relative min-h-0 flex-1 touch-pan-x overflow-hidden rounded-[20px] bg-sunk"
              role="img"
              {...swipe}
            >
              <Thumb item={item} large locale={locale} timeZone={timeZone} />
              <StatusChip big status={item.status} />
              {seriesCount >= 2 ? (
                <button
                  className="absolute top-2.5 right-2.5 inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[13px] font-semibold text-foreground"
                  onClick={onSeries}
                  type="button"
                >
                  <Layers aria-hidden="true" size={14} />
                  {t('mediaImport.flow.quick.series', { count: seriesCount })}
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2 px-0.5 pt-2.5 pb-1 text-sm">
              {when === null ? null : (
                <>
                  <Clock aria-hidden="true" className="text-muted" size={14} />
                  <span>{when}</span>
                </>
              )}
              {item.place === null ? null : (
                <>
                  <MapPin
                    aria-hidden="true"
                    className="ml-1.5 text-muted"
                    size={14}
                  />
                  <span>{item.place}</span>
                </>
              )}
            </div>
            <div className="grid grid-cols-[1fr_1.15fr_1fr] gap-2 pt-1.5">
              <button
                className={cn(
                  ACTION,
                  'bg-action-trash text-action-trash-foreground',
                )}
                onClick={() => {
                  onDecide('away')
                }}
                type="button"
              >
                <XCircle aria-hidden="true" size={26} />
                {t('mediaImport.flow.quick.away')}
              </button>
              <button
                className={cn(
                  ACTION,
                  'bg-action-keep text-action-keep-foreground',
                )}
                onClick={() => {
                  onDecide('keep')
                }}
                type="button"
              >
                <Check aria-hidden="true" size={26} />
                {t('mediaImport.flow.quick.keep')}
              </button>
              <button
                className={cn(
                  ACTION,
                  'bg-action-star text-action-star-foreground',
                )}
                onClick={() => {
                  onDecide('best')
                }}
                type="button"
              >
                <Star aria-hidden="true" size={26} />
                {t('mediaImport.flow.quick.best')}
              </button>
            </div>
            <Hint>
              <BoldParts
                text={t('mediaImport.flow.quick.hint', {
                  interpolation: { escapeValue: false },
                })}
              />
            </Hint>
            <p className="px-0.5 pt-2 pb-2.5 text-[13px] text-muted">
              <BoldParts
                text={t('mediaImport.flow.quick.counts', {
                  interpolation: { escapeValue: false },
                  left,
                  up,
                })}
              />
            </p>
          </div>
          <div className="h-[var(--flow-safe-bottom,env(safe-area-inset-bottom))] flex-none" />
        </>
      )}
    </FlowScreen>
  )
}

/** Renders a string with <b>..</b> parts as bold text (no HTML injection). */
function BoldParts({ text }: { text: string }) {
  const parts = text.split(/(<b>.*?<\/b>)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('<b>') ? (
          <b className="font-semibold text-foreground tabular-nums" key={i}>
            {part.slice(3, -4)}
          </b>
        ) : (
          part
        ),
      )}
    </>
  )
}

export function SeriesScreen({
  locale,
  members,
  onBack,
  onConfirm,
  timeZone,
}: {
  locale: string
  members: readonly TriageItem[]
  onBack: () => void
  /** Keep these ids (Ponechat), the others of the series go Pryč. */
  onConfirm: (keep: ReadonlySet<string>) => void
  timeZone: string
}) {
  const { t } = useTranslation()
  const loaders = useThumbnailLoaders()
  const [scores, setScores] = useState<Map<string, number> | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [multi, setMulti] = useState(false)
  const memberKey = members.map((m) => m.id).join('|')

  useEffect(() => {
    const life = { cancelled: false }
    loaders.large.request(members.map((m) => m.sourceId))
    void (async () => {
      const raw = new Map<string, number>()
      for (const member of members) {
        // Wait for the preview, then score it (sequential: small images).
        const src = await waitForSrc(
          loaders.large,
          loaders.grid,
          member.sourceId,
        )
        if (life.cancelled) return
        if (src === null) continue
        const score = await measureSharpness(src)
        if (score !== null) raw.set(member.id, score)
      }
      if (life.cancelled) return
      const relative = relativeSharpness(raw)
      setScores(relative)
      let best: string | null = null
      let bestScore = -1
      for (const [id, score] of relative) {
        if (score > bestScore) {
          best = id
          bestScore = score
        }
      }
      setSelected(new Set(best === null ? [] : [best]))
    })()
    return () => {
      life.cancelled = true
    }
    // memberKey stands for the member list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberKey])

  const recommended = useMemo(() => {
    let best: string | null = null
    let bestScore = -1
    for (const [id, score] of scores ?? []) {
      if (score > bestScore) {
        best = id
        bestScore = score
      }
    }
    return best
  }, [scores])

  const first = members[0]
  const last = members.at(-1)
  const time = (item: TriageItem | undefined) =>
    item?.capturedAt == null
      ? ''
      : formatTime(item.capturedAt, locale, timeZone)
  const label = (id: string): string => {
    const score = scores?.get(id)
    if (score === undefined) return ''
    if (id === recommended) return t('mediaImport.flow.series.sharpest')
    if (score >= 85) return t('mediaImport.flow.series.sharp')
    if (score < 60) return t('mediaImport.flow.series.blurry')
    return t('mediaImport.flow.series.soft')
  }
  function toggle(id: string) {
    setSelected((current) => {
      if (!multi) return new Set([id])
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const others = members.length - selected.size
  return (
    <FlowScreen>
      <FlowHeader
        left={
          <IconButton label={t('mediaImport.flow.back')} onClick={onBack}>
            <ChevronLeft aria-hidden="true" size={20} />
          </IconButton>
        }
      >
        {t('mediaImport.flow.series.title')}
      </FlowHeader>
      <FlowBody>
        {members.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {t('mediaImport.flow.series.empty')}
          </p>
        ) : (
          <>
            <Lead className="mt-0">
              {t('mediaImport.flow.series.lead', {
                count: members.length,
                from: time(first),
                to: time(last),
              })}
            </Lead>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {members.map((member) => {
                const on = selected.has(member.id)
                const score = scores?.get(member.id)
                return (
                  <button
                    aria-pressed={on}
                    className="relative block w-full p-0 text-left"
                    key={member.id}
                    onClick={() => {
                      toggle(member.id)
                    }}
                    type="button"
                  >
                    <span
                      className={cn(
                        'relative block aspect-square overflow-hidden rounded-2xl border-[3px]',
                        on ? 'border-primary' : 'border-transparent',
                      )}
                    >
                      <Thumb
                        item={member}
                        large
                        locale={locale}
                        timeZone={timeZone}
                      />
                      {member.id === recommended ? (
                        <span className="absolute top-2 left-2 inline-flex h-6 items-center gap-1 rounded-full bg-action-star px-[9px] text-xs font-bold text-action-star-foreground">
                          <Star aria-hidden="true" size={12} />
                          {t('mediaImport.flow.series.recommended')}
                        </span>
                      ) : null}
                      {on ? (
                        <span className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
                          <Check aria-hidden="true" size={16} strokeWidth={3} />
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center justify-between px-0.5 pt-1.5 text-[13px] text-muted">
                      <b
                        className={cn(
                          'font-normal',
                          member.id === recommended &&
                            'font-semibold text-foreground',
                        )}
                      >
                        {scores === null
                          ? t('mediaImport.flow.series.measuring')
                          : label(member.id)}
                      </b>
                      <span className="tabular-nums">
                        {score === undefined ? '' : `${String(score)} %`}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2.5 text-[13px] text-muted">
              {multi
                ? t('mediaImport.flow.series.keepMoreHint')
                : t('mediaImport.flow.series.note')}
            </p>
          </>
        )}
      </FlowBody>
      <FlowFooter>
        <PrimaryButton
          disabled={selected.size === 0 || members.length === 0}
          onClick={() => {
            onConfirm(selected)
          }}
        >
          {multi
            ? t('mediaImport.flow.series.keepSelected', {
                count: selected.size,
              })
            : t('mediaImport.flow.series.keepThis', { count: others })}
        </PrimaryButton>
        <SecondaryButton
          onClick={() => {
            setMulti((value) => !value)
          }}
          small
        >
          {t('mediaImport.flow.series.keepMore')}
        </SecondaryButton>
      </FlowFooter>
    </FlowScreen>
  )
}

/** Resolves with a loaded preview's src, or null if none arrives. */
function waitForSrc(
  large: ThumbnailLoader,
  grid: ThumbnailLoader,
  id: string,
): Promise<string | null> {
  return new Promise((resolve) => {
    const check = (): boolean => {
      for (const loader of [large, grid]) {
        const state = loader.get(id)
        if (state.status === 'ready') {
          resolve(state.src)
          return true
        }
        if (state.status === 'cloud' || state.status === 'missing') {
          if (loader === large) {
            resolve(null)
            return true
          }
        }
      }
      return false
    }
    if (check()) return
    const off = large.subscribe(() => {
      if (check()) off()
    })
    window.setTimeout(() => {
      off()
      resolve(null)
    }, 8000)
  })
}
