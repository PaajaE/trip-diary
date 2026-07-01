import { Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHECKLIST_TEMPLATES,
  listAppliedTemplateSlugs,
} from '@/entities/checklist/data/templates'
import { removeChecklistTemplate } from '@/entities/checklist/api/checklist-mutation.repository'
import type {
  ChecklistTemplate,
  JourneyChecklistItem,
} from '@/entities/checklist/model/checklist'
import type { NatureObservation } from '@/entities/nature/model/observation'
import { CustomGoalForm } from '@/features/nature/ui/CustomGoalForm'
import { JourneyNatureGuidePanel } from '@/features/nature/ui/JourneyNatureGuidePanel'
import { NatureEmptyState } from '@/features/nature/ui/NatureEmptyState'
import { NatureWishRow } from '@/features/nature/ui/NatureWishRow'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'

interface NatureDetailSheetProps {
  applyingTemplateSlug?: string | null
  availableTemplates?: ChecklistTemplate[]
  canEdit: boolean
  creatorId?: string
  items: JourneyChecklistItem[]
  journeyId: string
  observations: NatureObservation[]
  onApplyTemplate?: (templateSlug: string) => void
  onChanged?: () => void
  onClose: () => void
  onOpenWish: (item: JourneyChecklistItem) => void
  open: boolean
  savingItemId: string | null
}

function templateTitle(
  templateSlug: string,
  t: (key: string) => string,
): string {
  if (templateSlug === 'custom') {
    return t('nature.custom.templateTitle')
  }
  const template = CHECKLIST_TEMPLATES.find(
    (item) => item.slug === templateSlug,
  )
  return template === undefined ? templateSlug : t(template.titleKey)
}

export function NatureDetailSheet({
  applyingTemplateSlug = null,
  availableTemplates = [],
  canEdit,
  creatorId,
  items,
  journeyId,
  observations,
  onApplyTemplate,
  onChanged,
  onClose,
  onOpenWish,
  open,
  savingItemId,
}: NatureDetailSheetProps) {
  const { t } = useTranslation()
  const checkedCount = items.filter((item) => item.checkedAt !== null).length
  const appliedSlugs = listAppliedTemplateSlugs(items)
  const groupedItems = useMemo(() => {
    const groups = new Map<string, JourneyChecklistItem[]>()
    for (const item of items) {
      const group = groups.get(item.templateSlug) ?? []
      group.push(item)
      groups.set(item.templateSlug, group)
    }
    return [...groups.entries()]
  }, [items])

  async function handleRemoveTemplate(templateSlug: string) {
    if (creatorId === undefined) {
      return
    }
    if (!window.confirm(t('nature.template.removeConfirm'))) {
      return
    }
    await removeChecklistTemplate({
      creatorId,
      journeyId,
      templateSlug,
    })
    onChanged?.()
  }

  return (
    <SoftBottomSheet
      closeLabel={t('nature.strip.close')}
      onClose={onClose}
      open={open}
      title={t('nature.strip.detailTitle')}
    >
      <p className="text-sm text-muted">
        {items.length > 0
          ? t('nature.strip.progress', {
              checked: checkedCount,
              total: items.length,
            })
          : t('nature.strip.emptyHint')}
      </p>

      {items.length === 0 &&
      canEdit &&
      availableTemplates.length > 0 &&
      onApplyTemplate !== undefined ? (
        <NatureEmptyState
          applyingSlug={applyingTemplateSlug}
          onSelect={onApplyTemplate}
          templates={availableTemplates}
        />
      ) : null}

      {observations.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-foreground">
            {t('nature.strip.spottedTitle')}
          </h3>
          <ul className="mt-3 space-y-2">
            {observations.map((observation) => (
              <li
                className="rounded-xl bg-background/70 px-4 py-3"
                key={observation.id}
              >
                <p className="font-medium">{observation.commonName}</p>
                {observation.scientificName === null ? null : (
                  <p className="text-sm italic text-muted">
                    {observation.scientificName}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-6 space-y-6">
          {groupedItems.map(([templateSlug, groupItems]) => (
            <div key={templateSlug}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-foreground">
                  {templateTitle(templateSlug, t)}
                </h3>
                {canEdit &&
                creatorId !== undefined &&
                appliedSlugs.includes(templateSlug) ? (
                  <button
                    className="text-xs font-medium text-destructive hover:underline"
                    onClick={() => {
                      void handleRemoveTemplate(templateSlug)
                    }}
                    type="button"
                  >
                    {t('nature.template.remove')}
                  </button>
                ) : null}
              </div>
              <ul className="mt-3 space-y-2">
                {groupItems.map((item) => (
                  <li key={item.id}>
                    <NatureWishRow
                      canEdit={canEdit}
                      item={item}
                      onOpen={() => {
                        onOpenWish(item)
                      }}
                      saving={savingItemId === item.id}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {canEdit && creatorId !== undefined ? (
        <CustomGoalForm
          creatorId={creatorId}
          journeyId={journeyId}
          onCreated={() => {
            onChanged?.()
          }}
        />
      ) : null}

      <JourneyNatureGuidePanel
        checklistItems={items}
        className="mt-6 border-0 bg-transparent p-0 shadow-none"
        compact
        {...(creatorId !== undefined ? { creatorId } : {})}
        journeyId={journeyId}
        observations={observations}
        {...(onChanged !== undefined ? { onSpeciesAdded: onChanged } : {})}
        showAddToGoals={canEdit && creatorId !== undefined}
      />
    </SoftBottomSheet>
  )
}

export function NatureDetailLoading() {
  return (
    <Loader2
      aria-hidden="true"
      className="mt-4 animate-spin text-muted"
      size={18}
    />
  )
}
