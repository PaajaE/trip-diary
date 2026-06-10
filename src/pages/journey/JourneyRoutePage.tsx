import { useParams } from '@tanstack/react-router'
import { JourneyPage } from '@/pages/journey/JourneyPage'

export function JourneyRoutePage() {
  const { journeyId } = useParams({ from: '/j/$journeyId' })
  return <JourneyPage journeyId={journeyId} />
}
