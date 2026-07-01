import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
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
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import { listJourneyObservations } from '@/entities/nature/api/observation-mutation.repository'
import { ApplyChecklistTemplateSheet } from '@/features/checklist/ui/ApplyChecklistTemplateSheet'
import { NatureDetailSheet } from '@/features/nature/ui/NatureDetailSheet'
import { NatureEmptyState } from '@/features/nature/ui/NatureEmptyState'
import { NatureWishChip } from '@/features/nature/ui/NatureWishChip'
import { NatureWishDetailSheet } from '@/features/nature/ui/NatureWishDetailSheet'
import { cn } from '@/shared/lib/cn'

interface NatureOnTripStripProps {
  canEdit: boolean
  className?: string
  creatorId: string
  detailOpen?: boolean
  journeyId: string
  onChanged: () => void
  onDetailOpenChange?: (open: boolean) => void
  onShowOnMap?: (checklistItemId: string) => void
}

export function NatureOnTripStrip({
  canEdit,
  className,
  creatorId,
  detailOpen: detailOpenProp,
  journeyId,
  onChanged,
  onDetailOpenChange,
  onShowOnMap,
}: NatureOnTripStripProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [detailOpenInternal, setDetailOpenInternal] = useState(false)
  const detailOpen = detailOpenProp ?? detailOpenInternal
  const setDetailOpen = (open: boolean) => {
    if (onDetailOpenChange !== undefined) {
      onDetailOpenChange(open)
    } else {
      setDetailOpenInternal(open)
    }
  }
  const [applyOpen, setApplyOpen] = useState(false)
  const [activeWish, setActiveWish] = useState<JourneyChecklistItem | null>(
    null,
  )
  const [savingItemId, setSavingItemId] = useState<string | null>(null)

  const checklistQuery = useQuery({
    queryFn: () => listJourneyChecklistItems(journeyId),
    queryKey: ['journey-checklist', journeyId],
  })

  const observationsQuery = useQuery({
    queryFn: () => listJourneyObservations(journeyId),
    queryKey: ['journey-observations', journeyId],
  })

  const items = checklistQuery.data ?? []
  const observations = observationsQuery.data ?? []
  const appliedTemplateSlugs = listAppliedTemplateSlugs(items)
  const availableTemplates = CHECKLIST_TEMPLATES.filter(
    (template) => !appliedTemplateSlugs.includes(template.slug),
  )
  const checkedCount = items.filter((item) => item.checkedAt !== null).length
  const previewItems = items.slice(0, 8)

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

  async function toggleWish(item: JourneyChecklistItem, checked: boolean) {
    setSavingItemId(item.id)
    try {
      await setJourneyChecklistItemChecked({
        checked,
        creatorId,
        item,
        journeyId,
      })
      await queryClient.invalidateQueries({
        queryKey: ['journey-checklist', journeyId],
      })
      onChanged()
      if (activeWish?.id === item.id) {
        setActiveWish({
          ...item,
          checkedAt: checked ? new Date().toISOString() : null,
        })
      }
    } finally {
      setSavingItemId(null)
    }
  }

  const showEmptyTemplates =
    items.length === 0 && canEdit && availableTemplates.length > 0

  return (
    <section
      className={cn(
        'rounded-2xl bg-background/40 px-4 py-4 sm:px-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">{t('nature.strip.title')}</h3>
          {items.length > 0 ? (
            <p className="mt-1 text-sm text-muted">
              {t('nature.strip.progress', {
                checked: checkedCount,
                total: items.length,
              })}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {t('nature.strip.emptyHint')}
            </p>
          )}
        </div>
        {items.length > 0 ? (
          <button
            className="shrink-0 text-sm font-medium text-primary hover:underline"
            onClick={() => {
              setDetailOpen(true)
            }}
            type="button"
          >
            {t('nature.strip.viewAll')}
          </button>
        ) : null}
      </div>

      {checklistQuery.isPending ? (
        <p className="mt-4 text-sm text-muted" role="status">
          {t('nature.strip.loading')}
        </p>
      ) : null}

      {showEmptyTemplates ? (
        <NatureEmptyState
          applyingSlug={
            applyMutation.isPending ? applyMutation.variables : null
          }
          onSelect={(slug) => {
            applyMutation.mutate(slug)
          }}
          templates={availableTemplates}
        />
      ) : null}

      {items.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {previewItems.map((item) => (
            <NatureWishChip
              checked={item.checkedAt !== null}
              key={item.id}
              label={item.title}
              onSelect={() => {
                setActiveWish(item)
              }}
            />
          ))}
          {canEdit && availableTemplates.length > 0 ? (
            <button
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 py-2 text-sm text-muted hover:border-primary/30 hover:text-primary"
              onClick={() => {
                setApplyOpen(true)
              }}
              type="button"
            >
              <Plus aria-hidden="true" size={15} />
              {t('nature.strip.addTips')}
            </button>
          ) : null}
        </div>
      ) : null}

      {items.length === 0 &&
      !showEmptyTemplates &&
      !checklistQuery.isPending ? (
        <p className="mt-4 text-sm text-muted">{t('nature.strip.empty')}</p>
      ) : null}

      <NatureWishDetailSheet
        canEdit={canEdit}
        item={activeWish}
        journeyId={journeyId}
        onClose={() => {
          setActiveWish(null)
        }}
        onMarkSpotted={(item) => {
          const nextChecked = item.checkedAt === null
          if (
            !nextChecked &&
            !window.confirm(t('nature.strip.markNotSpottedConfirm'))
          ) {
            return
          }
          void toggleWish(item, nextChecked).then(() => {
            if (nextChecked) {
              setActiveWish(null)
            }
          })
        }}
        {...(onShowOnMap !== undefined ? { onOpenMap: onShowOnMap } : {})}
        open={activeWish !== null}
        saving={savingItemId === activeWish?.id}
      />

      <NatureDetailSheet
        applyingTemplateSlug={
          applyMutation.isPending ? applyMutation.variables : null
        }
        availableTemplates={availableTemplates}
        canEdit={canEdit}
        items={items}
        journeyId={journeyId}
        observations={observations}
        onApplyTemplate={(templateSlug) => {
          applyMutation.mutate(templateSlug)
        }}
        onClose={() => {
          setDetailOpen(false)
        }}
        onOpenWish={(item) => {
          setDetailOpen(false)
          setActiveWish(item)
        }}
        open={detailOpen}
        savingItemId={savingItemId}
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
