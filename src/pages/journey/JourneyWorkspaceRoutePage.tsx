import { useParams } from '@tanstack/react-router'
import { JourneyWorkspace } from '@/features/journey-workspace/ui/JourneyWorkspace'

export function JourneyWorkspaceRoutePage() {
  const { journeyId } = useParams({ from: '/j/$journeyId/workspace' })
  return <JourneyWorkspace journeyId={journeyId} />
}
