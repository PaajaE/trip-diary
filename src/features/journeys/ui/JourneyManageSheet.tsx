import { useTranslation } from 'react-i18next'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { JourneyOrganizePanel } from '@/features/journeys/ui/JourneyOrganizePanel'
import { FullScreenSheet } from '@/shared/ui/FullScreenSheet'

interface JourneyManageSheetProps {
  canManageJourney: boolean
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
  onClose: () => void
  onDeleted: () => void
  open: boolean
}

export function JourneyManageSheet({
  canManageJourney,
  creatorId,
  journey,
  onChanged,
  onClose,
  onDeleted,
  open,
}: JourneyManageSheetProps) {
  const { t } = useTranslation()

  return (
    <FullScreenSheet
      closeLabel={t('journey.manageClose')}
      onClose={onClose}
      open={open}
      title={t('journey.manageTrip')}
    >
      <JourneyOrganizePanel
        canManageJourney={canManageJourney}
        creatorId={creatorId}
        embedded
        journey={journey}
        onChanged={onChanged}
        onDeleted={onDeleted}
      />
    </FullScreenSheet>
  )
}
