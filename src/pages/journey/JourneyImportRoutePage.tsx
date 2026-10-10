import { useParams } from '@tanstack/react-router'
import { ImportPage } from '@/features/media-import/ui/ImportPage'

export function JourneyImportRoutePage() {
  const { journeyId } = useParams({ from: '/j/$journeyId/import' })
  return <ImportPage journeyId={journeyId} />
}
