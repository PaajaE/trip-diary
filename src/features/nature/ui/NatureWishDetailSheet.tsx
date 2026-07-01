import { Camera, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import { SoftBottomSheet } from '@/shared/ui/SoftBottomSheet'
import { Button } from '@/shared/ui/Button'

interface NatureWishDetailSheetProps {
  canEdit: boolean
  item: JourneyChecklistItem | null
  journeyId: string
  onClose: () => void
  onMarkSpotted: (item: JourneyChecklistItem) => void
  onOpenMap?: (checklistItemId: string) => void
  open: boolean
  saving: boolean
}

export function NatureWishDetailSheet({
  canEdit,
  item,
  journeyId,
  onClose,
  onMarkSpotted,
  onOpenMap,
  open,
  saving,
}: NatureWishDetailSheetProps) {
  const { t } = useTranslation()

  if (item === null) {
    return null
  }

  const checked = item.checkedAt !== null
  const stopId = item.stopId

  return (
    <SoftBottomSheet
      closeLabel={t('nature.strip.close')}
      onClose={onClose}
      open={open}
      title={item.title}
    >
      {item.notes === '' ? null : (
        <p className="text-sm leading-6 text-muted">{item.notes}</p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {stopId !== null && onOpenMap !== undefined ? (
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-medium text-primary hover:underline"
            onClick={() => {
              onOpenMap(item.id)
              onClose()
            }}
            type="button"
          >
            <MapPin aria-hidden="true" size={16} />
            {checked
              ? t('nature.strip.showOnMapVisited')
              : t('nature.strip.showOnMap')}
          </button>
        ) : null}

        {canEdit && !checked ? (
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary/8 px-4 text-sm font-medium text-primary"
            onClick={onClose}
            params={{ journeyId }}
            search={{ natureGoalId: item.id }}
            to="/j/$journeyId/memory/new"
          >
            <Camera aria-hidden="true" size={16} />
            {t('nature.strip.addPhoto')}
          </Link>
        ) : null}

        {canEdit ? (
          <Button
            disabled={saving}
            onClick={() => {
              onMarkSpotted(item)
            }}
            variant={checked ? 'secondary' : 'primary'}
          >
            {checked
              ? t('nature.strip.markNotSpotted')
              : t('nature.strip.markSpotted')}
          </Button>
        ) : null}
      </div>
    </SoftBottomSheet>
  )
}
