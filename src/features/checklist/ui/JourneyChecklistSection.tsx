import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bird,
  Flower2,
  Gem,
  Landmark,
  ListChecks,
  Loader2,
  MapPin,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHECKLIST_TEMPLATES,
  listAppliedTemplateSlugs,
} from '@/entities/checklist/data/templates'
import {
  applyChecklistTemplate,
  listJourneyChecklistItems,
  setJourneyChecklistItemChecked,
} from '@/entities/checklist/api/checklist-mutation.repository'
import type { ChecklistItemCategory } from '@/entities/checklist/model/checklist'
import { listJourneyObservations } from '@/entities/nature/api/observation.repository'
import { JourneyNatureGuidePanel } from '@/features/nature/ui/JourneyNatureGuidePanel'
import { ApplyChecklistTemplateSheet } from '@/features/checklist/ui/ApplyChecklistTemplateSheet'
import { cn } from '@/shared/lib/cn'

const CATEGORY_ICONS = {
  flora: Flower2,
  general: ListChecks,
  geology: Gem,
  landmark: Landmark,
  wildlife: Bird,
} as const

interface JourneyChecklistSectionProps {
  canEdit: boolean
  creatorId: string
  journeyId: string
  onChanged: () => void
}

export function JourneyChecklistSection({
  canEdit,
  creatorId,
  journeyId,
  onChanged,
}: JourneyChecklistSectionProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [applyOpen, setApplyOpen] = useState(false)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)

  const checklistQuery = useQuery({
    queryFn: () => listJourneyChecklistItems(journeyId),
    queryKey: ['journey-checklist', journeyId],
  })

  const observationsQuery = useQuery({
    queryFn: () => listJourneyObservations(journeyId),
    queryKey: ['journey-observations', journeyId],
  })

  const items = useMemo(() => checklistQuery.data ?? [], [checklistQuery.data])
  const appliedTemplateSlugs = listAppliedTemplateSlugs(items)
  const availableTemplates = CHECKLIST_TEMPLATES.filter(
    (template) => !appliedTemplateSlugs.includes(template.slug),
  )

  const groupedItems = useMemo(() => {
    const groups = new Map<ChecklistItemCategory, typeof items>()
    for (const item of items) {
      const current = groups.get(item.category) ?? []
      current.push(item)
      groups.set(item.category, current)
    }
    return [...groups.entries()]
  }, [items])

  const checkedCount = items.filter((item) => item.checkedAt !== null).length

  const applyMutation = useMutation({
    mutationFn: (templateSlug: string) =>
      applyChecklistTemplate({
        creatorId,
        journeyId,
        templateSlug,
        translate: t,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['journey-checklist', journeyId],
      })
      onChanged()
      setApplyOpen(false)
    },
  })

  async function toggleItem(item: (typeof items)[number]) {
    setSavingItemId(item.id)
    try {
      await setJourneyChecklistItemChecked({
        checked: item.checkedAt === null,
        creatorId,
        item,
        journeyId,
      })
      await queryClient.invalidateQueries({
        queryKey: ['journey-checklist', journeyId],
      })
      onChanged()
    } finally {
      setSavingItemId(null)
    }
  }

  return (
    <section
      className="scroll-mt-24 py-8 sm:scroll-mt-20 sm:py-10"
      id="checklist"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">
            {t('checklist.eyebrow')}
          </p>
          <h2 className="mt-3 text-2xl font-semibold">
            {t('checklist.title')}
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-muted">
            {t('checklist.description')}
          </p>
        </div>
        {canEdit && availableTemplates.length > 0 ? (
          <button
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            onClick={() => {
              setApplyOpen(true)
            }}
            type="button"
          >
            {t('checklist.addTemplate')}
          </button>
        ) : null}
      </div>

      {checklistQuery.isPending ? (
        <p className="mt-8 text-sm text-muted" role="status">
          {t('checklist.loading')}
        </p>
      ) : null}

      {checklistQuery.isError ? (
        <p className="mt-8 text-sm text-destructive" role="alert">
          {t('checklist.error')}
        </p>
      ) : null}

      {items.length === 0 && !checklistQuery.isPending ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border bg-surface p-6 text-muted">
          {t('checklist.empty')}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-8 space-y-8">
          <p className="text-sm font-semibold text-foreground">
            {t('checklist.progress', {
              checked: checkedCount,
              total: items.length,
            })}
          </p>

          {groupedItems.map(([category, categoryItems]) => {
            const Icon = CATEGORY_ICONS[category]
            return (
              <div key={category}>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted">
                  <Icon aria-hidden="true" size={16} />
                  {t(`checklist.category.${category}`)}
                </h3>
                <ul className="space-y-2">
                  {categoryItems.map((item) => {
                    const checked = item.checkedAt !== null
                    const saving = savingItemId === item.id
                    return (
                      <li key={item.id}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
                            checked
                              ? 'border-primary/30 bg-primary/5'
                              : 'border-border bg-surface',
                            !canEdit && 'cursor-default',
                          )}
                        >
                          <input
                            checked={checked}
                            className="mt-1 size-4 rounded border-border"
                            disabled={!canEdit || saving}
                            onChange={() => {
                              void toggleItem(item)
                            }}
                            type="checkbox"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold">
                              {item.title}
                            </span>
                            {item.notes === '' ? null : (
                              <span className="mt-1 block text-sm text-muted">
                                {item.notes}
                              </span>
                            )}
                            {item.stopId !== null ? (
                              <span className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
                                <MapPin aria-hidden="true" size={12} />
                                {checked
                                  ? t('checklist.onMapVisited')
                                  : t('checklist.onMapPlanned')}
                              </span>
                            ) : null}
                          </span>
                          {saving ? (
                            <Loader2
                              aria-hidden="true"
                              className="mt-0.5 animate-spin text-muted"
                              size={16}
                            />
                          ) : null}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      ) : null}

      <JourneyNatureGuidePanel
        checklistItems={items}
        className="mt-10"
        journeyId={journeyId}
        observations={observationsQuery.data ?? []}
      />

      <ApplyChecklistTemplateSheet
        applyingSlug={applyMutation.isPending ? applyMutation.variables : null}
        onApply={(templateSlug) => {
          applyMutation.mutate(templateSlug)
        }}
        onClose={() => {
          setApplyOpen(false)
        }}
        open={applyOpen}
        templates={availableTemplates}
      />
    </section>
  )
}
