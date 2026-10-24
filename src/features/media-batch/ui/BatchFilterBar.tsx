import { useTranslation } from 'react-i18next'
import {
  visibleFilters,
  type BatchFilter,
  type BatchFilterModel,
} from '@/features/media-batch/model/batch-filters'
import { cn } from '@/shared/lib/cn'

interface BatchFilterBarProps {
  active: BatchFilter
  model: BatchFilterModel
  onChange: (filter: BatchFilter) => void
}

/** Chip row under the batch header: "All", "No location", "Series", "Videos". */
export function BatchFilterBar({
  active,
  model,
  onChange,
}: BatchFilterBarProps) {
  const { t } = useTranslation()
  return (
    <div
      aria-label={t('mediaBatch.filter.label')}
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      role="group"
    >
      {visibleFilters(model).map((filter) => (
        <button
          aria-pressed={filter === active}
          className={cn(
            'min-h-11 shrink-0 touch-manipulation rounded-full border px-4 text-sm font-medium',
            filter === active
              ? 'border-primary bg-primary text-white'
              : 'border-border hover:bg-surface',
          )}
          key={filter}
          type="button"
          onClick={() => {
            onChange(filter)
          }}
        >
          {t(`mediaBatch.filter.${filter}`)}
          <span className="ml-1.5 opacity-80">{model.counts[filter]}</span>
        </button>
      ))}
    </div>
  )
}
