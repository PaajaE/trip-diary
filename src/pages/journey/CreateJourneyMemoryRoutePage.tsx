import { useParams, useSearch } from '@tanstack/react-router'
import { CreateJourneyMemoryPage } from '@/pages/journey/CreateJourneyMemoryPage'

export function CreateJourneyMemoryRoutePage() {
  const { journeyId } = useParams({ from: '/j/$journeyId/memory/new' })
  const { natureGoalId } = useSearch({ from: '/j/$journeyId/memory/new' })
  return (
    <CreateJourneyMemoryPage
      journeyId={journeyId}
      {...(natureGoalId !== undefined ? { natureGoalId } : {})}
    />
  )
}
