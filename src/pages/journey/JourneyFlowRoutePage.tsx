import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FlowIntakePage } from '@/features/journey-flow/ui/FlowIntakePage'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyFlowRoutePage() {
  const { t } = useTranslation()
  const { journeyId } = useParams({ from: '/j/$journeyId/flow' })
  return (
    <JourneyOwnerFrame
      current="flow"
      journeyId={journeyId}
      title={t('flow.screen.intake.title')}
      width="wide"
    >
      <FlowIntakePage journeyId={journeyId} />
    </JourneyOwnerFrame>
  )
}
