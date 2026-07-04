import { useParams, useSearch } from '@tanstack/react-router'
import type { JourneyAuthorSection } from '@/features/journeys/lib/journey-author-section'
import { JourneyPage } from '@/pages/journey/JourneyPage'

function normalizeJourneySection(
  section?: JourneyAuthorSection | 'guides' | 'more' | 'overview',
): JourneyAuthorSection | undefined {
  if (
    section === undefined ||
    section === 'overview' ||
    section === 'more' ||
    section === 'guides'
  ) {
    return undefined
  }
  return section
}

export function JourneyRoutePage() {
  const { journeyId } = useParams({ from: '/j/$journeyId' })
  const search = useSearch({ from: '/j/$journeyId' })
  const section = normalizeJourneySection(search.section)

  return (
    <JourneyPage
      journeyId={journeyId}
      {...(search.highlight !== undefined ? { highlight: search.highlight } : {})}
      {...(search.naturePrompt !== undefined
        ? { naturePrompt: search.naturePrompt }
        : {})}
      {...(search.natureGoalId !== undefined
        ? { natureGoalId: search.natureGoalId }
        : {})}
      {...(search.notice !== undefined ? { notice: search.notice } : {})}
      {...(section !== undefined ? { section } : {})}
    />
  )
}
