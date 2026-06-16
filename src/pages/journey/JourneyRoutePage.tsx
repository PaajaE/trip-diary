import { useParams, useSearch } from '@tanstack/react-router'
import { JourneyPage } from '@/pages/journey/JourneyPage'

export function JourneyRoutePage() {
  const { journeyId } = useParams({ from: '/j/$journeyId' })
  const search = useSearch({ from: '/j/$journeyId' })
  return <JourneyPage journeyId={journeyId} notice={search.notice} />
}
