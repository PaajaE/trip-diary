import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { BatchPage } from '@/features/media-batch/ui/BatchPage'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyBatchRoutePage() {
  const { t } = useTranslation()
  const { journeyId } = useParams({ from: '/j/$journeyId/batch' })
  return (
    <JourneyOwnerFrame
      current="batch"
      description={t('mediaBatch.description')}
      journeyId={journeyId}
      title={t('mediaBatch.title')}
      width="wide"
    >
      <BatchPage journeyId={journeyId} />
    </JourneyOwnerFrame>
  )
}
