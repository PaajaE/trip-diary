import { Leaf } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ChecklistTemplate } from '@/entities/checklist/model/checklist'
import { NatureTemplateCards } from '@/features/nature/ui/NatureTemplateCards'

interface NatureEmptyStateProps {
  applyingSlug: string | null
  onSelect: (slug: string) => void
  selectedSlug?: string | null
  templates: ChecklistTemplate[]
}

export function NatureEmptyState({
  applyingSlug,
  onSelect,
  selectedSlug = null,
  templates,
}: NatureEmptyStateProps) {
  const { t } = useTranslation()

  return (
    <div className="mt-4">
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-border/80 bg-background/40 px-4 py-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Leaf aria-hidden="true" size={22} />
        </div>
        <p className="mt-3 text-sm font-medium">{t('nature.empty.title')}</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          {t('nature.empty.hint')}
        </p>
      </div>
      <div className="mt-4">
        <NatureTemplateCards
          applyingSlug={applyingSlug}
          onSelect={onSelect}
          selectedSlug={selectedSlug}
          templates={templates}
        />
      </div>
    </div>
  )
}
