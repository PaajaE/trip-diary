import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'
import { WorkspaceToolbar } from '@/features/journey-workspace/ui/WorkspaceToolbar'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyWorkspaceRoutePage() {
  const { t } = useTranslation()
  const { journeyId } = useParams({ from: '/j/$journeyId/workspace' })
  return (
    <JourneyOwnerFrame
      actions={<WorkspaceToolbar journeyId={journeyId} />}
      current="workspace"
      description={t('workspace.subtitle')}
      descriptionClassName="hidden sm:block"
      journeyId={journeyId}
      width="wide"
    >
      <JourneyWorkspace journeyId={journeyId} />
    </JourneyOwnerFrame>
  )
}
