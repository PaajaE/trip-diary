import { useTranslation } from 'react-i18next'
import type { ChecklistTemplate } from '@/entities/checklist/model/checklist'
import { cn } from '@/shared/lib/cn'

interface NatureTemplateCardsProps {
  applyingSlug: string | null
  onSelect: (slug: string) => void
  templates: ChecklistTemplate[]
}

export function NatureTemplateCards({
  applyingSlug,
  onSelect,
  templates,
}: NatureTemplateCardsProps) {
  const { t } = useTranslation()

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 snap-x snap-mandatory">
      {templates.map((template) => {
        const applying = applyingSlug === template.slug
        return (
          <button
            className={cn(
              'w-[min(72vw,16rem)] shrink-0 snap-start rounded-2xl border border-border/80 bg-background/60 p-4 text-left transition hover:bg-background disabled:opacity-60',
            )}
            disabled={applyingSlug !== null}
            key={template.slug}
            onClick={() => {
              onSelect(template.slug)
            }}
            type="button"
          >
            <p className="font-medium leading-snug">{t(template.titleKey)}</p>
            <p className="mt-1 text-xs text-muted">{t(template.regionKey)}</p>
            <p className="mt-3 text-xs text-muted">
              {applying
                ? t('nature.strip.applying')
                : t('nature.strip.templateItemCount', {
                    count: template.items.length,
                  })}
            </p>
          </button>
        )
      })}
    </div>
  )
}
