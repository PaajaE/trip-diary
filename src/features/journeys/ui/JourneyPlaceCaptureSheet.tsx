import { useTranslation } from 'react-i18next'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { JourneyPlaceCaptureForm } from '@/features/journeys/ui/JourneyPlaceCaptureForm'
import { FullScreenSheet } from '@/shared/ui/FullScreenSheet'

interface JourneyPlaceCaptureSheetProps {
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
  onClose: () => void
  open: boolean
}

export function JourneyPlaceCaptureSheet({
  creatorId,
  journey,
  onChanged,
  onClose,
  open,
}: JourneyPlaceCaptureSheetProps) {
  const { t } = useTranslation()

  return (
    <FullScreenSheet
      closeLabel={t('journey.manageClose')}
      onClose={onClose}
      open={open}
      title={t('journey.addPlace')}
    >
      <JourneyPlaceCaptureForm
        creatorId={creatorId}
        journey={journey}
        onChanged={onChanged}
        onClose={onClose}
      />
    </FullScreenSheet>
  )
}
