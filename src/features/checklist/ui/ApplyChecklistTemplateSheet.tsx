import { useTranslation } from 'react-i18next'
import type { ChecklistTemplate } from '@/entities/checklist/model/checklist'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'

interface ApplyChecklistTemplateSheetProps {
  applyingSlug: string | null
  onApply: (templateSlug: string) => void
  onClose: () => void
  open: boolean
  templates: ChecklistTemplate[]
}

export function ApplyChecklistTemplateSheet({
  applyingSlug,
  onApply,
  onClose,
  open,
  templates,
}: ApplyChecklistTemplateSheetProps) {
  const { t } = useTranslation()

  return (
    <SoftBottomSheet
      closeLabel={t('nature.strip.close')}
      onClose={onClose}
      open={open}
      title={t('nature.strip.pickPark')}
    >
      <p className="mb-4 text-sm text-muted">
        {t('nature.strip.pickParkHint')}
      </p>
      <div className="space-y-2">
        {templates.map((template) => {
          const applying = applyingSlug === template.slug
          return (
            <button
              className="w-full rounded-2xl bg-background/70 px-4 py-4 text-left transition hover:bg-background disabled:opacity-60"
              disabled={applyingSlug !== null}
              key={template.slug}
              onClick={() => {
                onApply(template.slug)
              }}
              type="button"
            >
              <p className="font-medium">{t(template.titleKey)}</p>
              <p className="mt-1 text-sm text-muted">{t(template.regionKey)}</p>
              <p className="mt-2 text-xs text-muted">
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
    </SoftBottomSheet>
  )
}
