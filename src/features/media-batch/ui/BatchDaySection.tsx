import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { formatDayHeading } from '@/features/journey-workspace/lib/format-range'
import type { BatchDay } from '@/features/media-batch/model/batch-days'
import { BatchTile } from '@/features/media-batch/ui/BatchTile'

interface BatchDaySectionProps {
  allSelected: boolean
  baseUrl: string
  canEdit: boolean
  day: BatchDay
  isSelected: (id: string) => boolean
  locale: string
  onActivate: (item: MediaItem, trigger: HTMLElement, range: boolean) => void
  onToggleDay: (day: BatchDay, on: boolean) => void
  selecting: boolean
}

/** One local day of the batch: heading, "select day" and the tile grid. */
export function BatchDaySection({
  allSelected,
  baseUrl,
  canEdit,
  day,
  isSelected,
  locale,
  onActivate,
  onToggleDay,
  selecting,
}: BatchDaySectionProps) {
  const { t } = useTranslation()
  const label =
    day.heading === null
      ? t('mediaBatch.undated')
      : formatDayHeading(day.heading.iso, day.heading.tz, locale)
  return (
    <section aria-label={label} data-testid="batch-day">
      <div className="mb-2 flex min-h-11 items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">
          {label}
          <span className="ml-2 text-sm font-normal text-muted">
            {t('mediaBatch.items', { count: day.items.length })}
          </span>
        </h2>
        {canEdit ? (
          <button
            className="min-h-11 shrink-0 touch-manipulation rounded-md border border-border px-3 text-sm font-medium hover:bg-surface"
            type="button"
            onClick={() => {
              onToggleDay(day, !allSelected)
            }}
          >
            {allSelected
              ? t('mediaBatch.unselectDay')
              : t('mediaBatch.selectDay')}
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1.5 min-[480px]:grid-cols-4 min-[760px]:grid-cols-5 lg:grid-cols-6">
        {day.items.map((item) => (
          <BatchTile
            baseUrl={baseUrl}
            item={item}
            key={item.id}
            selected={isSelected(item.id)}
            selecting={selecting}
            onActivate={onActivate}
          />
        ))}
      </div>
    </section>
  )
}
