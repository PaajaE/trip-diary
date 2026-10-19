import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { TrashPage } from '@/features/journey-workspace/ui/TrashPage'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyTrashRoutePage() {
  const { t } = useTranslation()
  const { journeyId } = useParams({ from: '/j/$journeyId/trash' })
  return (
    <JourneyOwnerFrame
      current="trash"
      journeyId={journeyId}
      title={t('trash.title')}
      width="wide"
    >
      <TrashPage journeyId={journeyId} />
    </JourneyOwnerFrame>
  )
}
