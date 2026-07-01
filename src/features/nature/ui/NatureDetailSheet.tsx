import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import type { NatureObservation } from '@/entities/nature/model/observation'
import { JourneyNatureGuidePanel } from '@/features/nature/ui/JourneyNatureGuidePanel'
import { NatureWishRow } from '@/features/nature/ui/NatureWishRow'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'

interface NatureDetailSheetProps {
  canEdit: boolean
  items: JourneyChecklistItem[]
  journeyId: string
  observations: NatureObservation[]
  onClose: () => void
  onOpenWish: (item: JourneyChecklistItem) => void
  open: boolean
  savingItemId: string | null
}

export function NatureDetailSheet({
  canEdit,
  items,
  journeyId,
  observations,
  onClose,
  onOpenWish,
  open,
  savingItemId,
}: NatureDetailSheetProps) {
  const { t } = useTranslation()
  const checkedCount = items.filter((item) => item.checkedAt !== null).length

  return (
    <SoftBottomSheet
      closeLabel={t('nature.strip.close')}
      onClose={onClose}
      open={open}
      title={t('nature.strip.detailTitle')}
    >
      <p className="text-sm text-muted">
        {t('nature.strip.progress', {
          checked: checkedCount,
          total: items.length,
        })}
      </p>

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

      <div className="mt-6">
        <h3 className="text-sm font-medium text-foreground">
          {t('nature.strip.wishesTitle')}
        </h3>
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
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

      <JourneyNatureGuidePanel
        checklistItems={items}
        className="mt-6 border-0 bg-transparent p-0 shadow-none"
        journeyId={journeyId}
        observations={observations}
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
