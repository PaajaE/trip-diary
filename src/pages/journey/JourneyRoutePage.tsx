import { Navigate, useParams } from '@tanstack/react-router'

/**
 * v2 switchover: the owner view of a journey is the workspace. The v1
 * `JourneyPage` is no longer routed and is removed with the rest of v1.
 */
export function JourneyRoutePage() {
  const { journeyId } = useParams({ from: '/j/$journeyId' })
  return (
    <Navigate params={{ journeyId }} replace to="/j/$journeyId/workspace" />
  )
}
