import { Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { TrashHintReason } from '@/features/journey-flow/model/day-sort'
import { ComparePane } from '@/features/media-batch/ui/ComparePane'
import type { PhotoCompareApi } from '@/features/media-batch/ui/use-photo-compare'
import {
  useSwipe,
  type SwipeDirection,
} from '@/features/media-batch/ui/use-swipe'
import { cn } from '@/shared/lib/cn'

export type DuelRole = 'challenger' | 'winner'

const ICON =
  'flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40'

/**
 * One photo of the compare duel: role badge, "Nechat tuhle", ★ and a trash
 * button (swipe up does the same), the shared zoom of the compare view.
 */
export function DuelPane({
  api,
  bare,
  baseUrl,
  hint,
  item,
  kept,
  onHover,
  onKeep,
  onStar,
  onSwipe,
  onTap,
  onTrash,
  role,
  sharpness,
  starred,
}: {
  api: PhotoCompareApi
  /** Full screen: no caption and no buttons. */
  bare: boolean
  baseUrl: string
  hint: TrashHintReason | null
  item: MediaItem
  kept: boolean
  /** The mouse entered (true) or left (false) this photo. */
  onHover: (inside: boolean) => void
  onKeep: () => void
  onStar: () => void
  onSwipe: (direction: SwipeDirection) => void
  onTap?: () => void
  onTrash: () => void
  role: DuelRole
  sharpness: ReadonlyMap<string, number | null>
  starred: boolean
}) {
  const { t } = useTranslation()
  const swipe = useSwipe({
    enabled: () => !api.zoomed,
    onSwipe,
    ...(onTap === undefined ? {} : { onTap }),
  })
  const which = t(`flow.duel.${role}`)
  const badge = (
    <span className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
      <span className="rounded-full bg-black/75 px-2.5 py-0.5 text-xs font-semibold text-white">
        {which}
      </span>
      {hint === null || role !== 'challenger' ? null : (
        <span className="rounded-full bg-action-trash px-2.5 py-0.5 text-xs font-semibold text-action-trash-foreground">
          {t('flow.duel.suggestTrash')}
        </span>
      )}
    </span>
  )
  const footer = (
    <span className="mt-1 flex items-center gap-2">
      <button
        aria-label={t('flow.duel.keepThisLabel', { which })}
        aria-pressed={kept}
        className={cn(
          'flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-bold',
          kept
            ? 'bg-action-keep text-action-keep-foreground'
            : 'bg-white/10 text-white hover:bg-white/20',
        )}
        type="button"
        onClick={onKeep}
      >
        {t('flow.duel.keepThis')}
      </button>
      <button
        aria-label={t('flow.duel.starLabel', { which })}
        aria-pressed={starred}
        className={cn(
          ICON,
          'bg-action-star text-action-star-foreground hover:bg-action-star-hover',
        )}
        type="button"
        onClick={onStar}
      >
        <Star
          aria-hidden="true"
          className={starred ? 'fill-action-star-foreground' : ''}
          size={18}
        />
      </button>
      <button
        aria-label={t('flow.duel.trashLabel', { which })}
        className={cn(
          ICON,
          'bg-action-trash text-action-trash-foreground hover:bg-action-trash-hover',
        )}
        type="button"
        onClick={onTrash}
      >
        <Trash2 aria-hidden="true" size={18} />
      </button>
    </span>
  )
  return (
    <div
      className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)]"
      data-role={role}
      data-testid="duel-pane"
      onMouseEnter={() => {
        onHover(true)
      }}
      onMouseLeave={() => {
        onHover(false)
      }}
    >
      <ComparePane
        actions={undefined}
        api={api}
        badge={badge}
        bare={bare}
        baseUrl={baseUrl}
        dimmed={false}
        footer={footer}
        gestures={swipe}
        isMain={role === 'winner'}
        item={item}
        label={role === 'winner' ? 'A' : 'B'}
        sharpness={sharpness}
        showActions={false}
        stopTitle={null}
      />
    </div>
  )
}
