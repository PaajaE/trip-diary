import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FlowSortPage } from '@/features/journey-flow/ui/FlowSortPage'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyFlowSortRoutePage() {
  const { t } = useTranslation()
  const { dayKey, journeyId } = useParams({
    from: '/j/$journeyId/flow/$dayKey/sort',
  })
  return (
    <JourneyOwnerFrame
      current="flow"
      journeyId={journeyId}
      title={t('flow.intake.step2')}
      width="wide"
    >
      <FlowSortPage dayKey={dayKey} journeyId={journeyId} />
    </JourneyOwnerFrame>
  )
}
