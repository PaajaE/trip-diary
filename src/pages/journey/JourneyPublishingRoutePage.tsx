import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PublishingPage } from '@/features/journey-workspace/ui/PublishingPage'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyPublishingRoutePage() {
  const { t } = useTranslation()
  const { journeyId } = useParams({ from: '/j/$journeyId/publishing' })
  return (
    <JourneyOwnerFrame
      current="publishing"
      journeyId={journeyId}
      title={t('publishing.title')}
      width="narrow"
    >
      <PublishingPage journeyId={journeyId} />
    </JourneyOwnerFrame>
  )
}
