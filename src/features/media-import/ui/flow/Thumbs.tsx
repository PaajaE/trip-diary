import {
  Check,
  Cloud,
  Image as ImageIcon,
  Play,
  Star,
  Undo2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  TriageItem,
  TriageStatus,
} from '@/entities/media/model/triage-item'
import { formatTime } from '@/features/media-import/model/triage-format'
import {
  useThumbnail,
  useThumbnailLoaders,
} from '@/features/media-import/ui/flow/thumbnail-context'
import { itemZone } from '@/features/media-import/model/triage'
import { cn } from '@/shared/lib/cn'

const SHEEN =
  'bg-[linear-gradient(100deg,var(--color-sunk)_30%,var(--color-border)_50%,var(--color-sunk)_70%)] bg-[length:220%_100%] motion-safe:animate-pulse'

/** Picture of an item, or its stand-in (loading, iCloud cloud, missing). */
export function Thumb({
  item,
  large,
  locale,
  timeZone,
  visible = true,
}: {
  item: TriageItem
  large?: boolean
  locale: string
  timeZone: string
  visible?: boolean
}) {
  const loaders = useThumbnailLoaders()
  const state = useThumbnail(
    large === true ? loaders.large : loaders.grid,
    item.sourceId,
    visible,
  )
  // The large picture falls back to the grid one while it loads.
  const fallback = useThumbnail(loaders.grid, item.sourceId, false)
  const shown =
    state.status === 'ready'
      ? state
      : large === true && fallback.status === 'ready'
        ? fallback
        : state
  if (shown.status === 'ready') {
    return (
      <img
        alt=""
        className="absolute inset-0 size-full object-cover"
        decoding="async"
        draggable={false}
        src={shown.src}
      />
    )
  }
  if (shown.status === 'loading') {
    return <span aria-hidden="true" className={cn('absolute inset-0', SHEEN)} />
  }
  if (shown.status === 'cloud') {
    return (
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-sunk text-xs font-semibold text-muted">
        <Cloud aria-hidden="true" size={26} strokeWidth={1.75} />
        {item.capturedAt === null
          ? null
          : formatTime(
              item.capturedAt,
              locale,
              itemZone(item, timeZone).timeZone,
            )}
      </span>
    )
  }
  return (
    <span className="absolute inset-0 grid place-items-center bg-sunk text-muted">
      {item.mediaType === 'video' ? (
        <Play aria-hidden="true" size={26} strokeWidth={1.75} />
      ) : (
        <ImageIcon aria-hidden="true" size={26} strokeWidth={1.75} />
      )}
    </span>
  )
}

const STATUS_STYLE: Record<
  Exclude<TriageStatus, 'found' | 'uploaded'>,
  string
> = {
  dismissed: 'bg-action-trash text-action-trash-foreground',
  kept: 'bg-action-keep text-action-keep-foreground',
  starred: 'bg-action-star text-action-star-foreground',
}

/** Chip of a decided state (undecided items carry none, decision 4). */
export function StatusChip({
  big,
  label,
  status,
}: {
  big?: boolean
  label?: string
  status: TriageStatus
}) {
  const { t } = useTranslation()
  if (status === 'found' || status === 'uploaded') return null
  const Icon =
    label === undefined
      ? status === 'kept'
        ? Check
        : status === 'starred'
          ? Star
          : X
      : Undo2
  return (
    <span
      className={cn(
        'absolute inline-flex items-center gap-[3px] rounded-full font-semibold leading-none',
        STATUS_STYLE[status],
        big === true
          ? 'top-2.5 left-2.5 h-[26px] gap-1 pr-2.5 pl-2 text-[13px]'
          : 'bottom-1 left-1 h-5 pr-[7px] pl-[5px] text-xs',
      )}
    >
      <Icon aria-hidden="true" size={12} strokeWidth={3} />
      {label ?? t(`mediaImport.flow.triage.status.${status}`)}
    </span>
  )
}

function duration(ms: number): string {
  const total = Math.round(ms / 1000)
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}

/** One square tile of the triage grid. */
export function TriageTile({
  item,
  locale,
  onOpen,
  restore,
  timeZone,
}: {
  item: TriageItem
  locale: string
  onOpen: () => void
  /** Dismissed screen: tap restores instead of opening. */
  restore?: boolean
  timeZone: string
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const near = useNearViewport(ref)
  const dismissed = item.status === 'dismissed'
  const label = [
    restore === true
      ? t('mediaImport.flow.dismissed.restore')
      : t(
          `mediaImport.flow.triage.status.${item.status === 'uploaded' ? 'kept' : item.status}`,
        ),
    item.icloudOnly ? t('mediaImport.flow.triage.cloudLabel') : null,
    item.mediaType === 'video' ? t('mediaImport.flow.triage.videoLabel') : null,
    item.capturedAt === null
      ? null
      : formatTime(item.capturedAt, locale, itemZone(item, timeZone).timeZone),
  ]
    .filter((part): part is string => part !== null)
    .join(', ')
  return (
    <button
      aria-label={label}
      className="relative aspect-square overflow-hidden rounded-md bg-sunk p-0"
      data-status={item.status}
      onClick={onOpen}
      ref={ref}
      type="button"
    >
      <span
        className={cn(
          'absolute inset-0',
          dismissed && 'opacity-45 brightness-[0.7] grayscale',
        )}
      >
        <Thumb item={item} locale={locale} timeZone={timeZone} visible={near} />
      </span>
      {dismissed ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgb(0_0_0/0.14)_7px_9px)]"
        />
      ) : null}
      {item.mediaType === 'video' ? (
        <span className="absolute top-1 left-1 inline-flex h-[22px] min-w-[22px] items-center justify-center gap-[3px] rounded-full bg-[#1f231e] px-1.5 text-xs font-semibold text-white">
          <Play aria-hidden="true" fill="currentColor" size={13} />
          {item.durationMs === null ? null : duration(item.durationMs)}
        </span>
      ) : null}
      {item.icloudOnly ? (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-border bg-surface px-1.5 text-foreground"
        >
          <Cloud size={13} />
        </span>
      ) : null}
      <StatusChip
        status={item.status}
        {...(restore === true
          ? { label: t('mediaImport.flow.dismissed.restore') }
          : {})}
      />
    </button>
  )
}

/** True once the element was within ~600 px of the viewport (sticky). */
function useNearViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const node = ref.current
    if (near || node === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [near, ref])
  return near
}
