import { Check, Star, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SeriesNote } from '@/features/journey-flow/model/series-pick'
import type { SessionPhoto } from '@/features/journey-flow/model/sort-session'
import {
  formatLocalTime,
  mediaDisplayZone,
} from '@/features/journey-workspace/lib/format-range'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import { cn } from '@/shared/lib/cn'

/**
 * One photo of the series grid: a tap picks it for comparing, the mark in
 * the corner switches nechat / koš. A ★ photo always stays (its mark is
 * locked on nechat).
 */
export function SeriesGridItem({
  baseUrl,
  kept,
  note,
  onPick,
  onToggle,
  photo,
  pickedAs,
  starred,
}: {
  baseUrl: string
  kept: boolean
  note: SeriesNote | null
  onPick: () => void
  onToggle: () => void
  photo: SessionPhoto
  /** 1-based position among the photos picked for comparing, 0 = not. */
  pickedAs: number
  starred: boolean
}) {
  const { i18n, t } = useTranslation()
  const zone = mediaDisplayZone(photo.item, null)
  const time =
    photo.item.capturedAt === null
      ? t('quickSort.noDate')
      : formatLocalTime(photo.item.capturedAt, zone, i18n.language)
  const noteText = note === null ? null : t(`flow.seriesPick.note.${note}`)
  const label = [
    t('flow.seriesPick.photo', { time }),
    starred ? '★' : null,
    noteText,
    pickedAs === 0 ? null : t('flow.seriesPick.picked', { n: pickedAs }),
  ]
    .filter((part) => part !== null)
    .join(', ')
  return (
    <li className="relative min-w-0" data-photo-id={photo.item.id}>
      <button
        aria-label={label}
        aria-pressed={pickedAs !== 0}
        className={cn(
          'block w-full overflow-hidden rounded-xl',
          pickedAs !== 0 && 'outline outline-2 outline-offset-2 outline-white',
          !kept && 'opacity-60',
        )}
        type="button"
        onClick={onPick}
      >
        <MediaThumb
          baseUrl={baseUrl}
          className="aspect-square w-full"
          item={photo.item}
        />
      </button>
      {pickedAs === 0 ? null : (
        <span
          aria-hidden="true"
          className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-white text-xs font-bold text-black"
        >
          {pickedAs}
        </span>
      )}
      {starred ? (
        <Star
          aria-hidden="true"
          className="absolute bottom-8 left-1.5 fill-action-star text-action-star"
          size={16}
        />
      ) : null}
      <button
        aria-label={
          starred
            ? t('flow.seriesPick.starKept')
            : kept
              ? t('flow.seriesPick.toTrash')
              : t('flow.seriesPick.toKeep')
        }
        aria-pressed={kept}
        className="absolute right-0 top-0 flex size-11 items-center justify-center disabled:cursor-not-allowed"
        data-testid="series-toggle"
        disabled={starred}
        type="button"
        onClick={onToggle}
      >
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-full border-2 border-black',
            kept
              ? 'bg-action-keep text-action-keep-foreground'
              : 'bg-action-trash text-action-trash-foreground',
          )}
        >
          {kept ? (
            <Check aria-hidden="true" size={14} />
          ) : (
            <Trash2 aria-hidden="true" size={14} />
          )}
        </span>
      </button>
      <p className="mt-1 truncate text-xs text-white/80">
        {[time, noteText].filter((part) => part !== null).join(' · ')}
      </p>
    </li>
  )
}
