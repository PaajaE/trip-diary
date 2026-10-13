import { useParams } from '@tanstack/react-router'
import { QuickNotePage } from '@/features/quick-note/ui/QuickNotePage'

export function JourneyQuickNoteRoutePage() {
  const { journeyId } = useParams({ from: '/j/$journeyId/quick' })
  return <QuickNotePage journeyId={journeyId} />
}
