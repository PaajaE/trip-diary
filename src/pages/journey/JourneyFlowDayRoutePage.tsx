import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FlowDayPage } from '@/features/journey-flow/ui/FlowDayPage'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyFlowDayRoutePage() {
  const { t } = useTranslation()
  const { dayKey, journeyId } = useParams({
    from: '/j/$journeyId/flow/$dayKey',
  })
  return (
    <JourneyOwnerFrame
      current="flow"
      journeyId={journeyId}
      title={t('flow.intake.step1')}
      width="wide"
    >
      <FlowDayPage dayKey={dayKey} journeyId={journeyId} />
    </JourneyOwnerFrame>
  )
}
