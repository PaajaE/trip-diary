import { useParams, useSearch } from '@tanstack/react-router'
import { JourneyPage } from '@/pages/journey/JourneyPage'

type JourneyRouteSection = 'gallery' | 'map' | 'overview' | 'story'

export function JourneyRoutePage() {
  const { journeyId } = useParams({ from: '/j/$journeyId' })
  const search = useSearch({ from: '/j/$journeyId' })
  const section = normalizeJourneySection(search.section)

  return (
    <JourneyPage
      journeyId={journeyId}
      {...(search.highlight !== undefined
        ? { highlight: search.highlight }
        : {})}
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

function normalizeJourneySection(
  section?: 'gallery' | 'guides' | 'map' | 'more' | 'overview' | 'story',
): JourneyRouteSection | undefined {
  if (
    section === undefined ||
    section === 'more' ||
    section === 'guides'
  ) {
    return undefined
  }
  return section
}
