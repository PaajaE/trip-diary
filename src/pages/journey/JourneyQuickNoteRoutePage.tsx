import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { QuickNotePage } from '@/features/quick-note/ui/QuickNotePage'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyQuickNoteRoutePage() {
  const { t } = useTranslation()
  const { journeyId } = useParams({ from: '/j/$journeyId/quick' })
  return (
    <JourneyOwnerFrame
      current="quick"
      width="form"
      description={t('quickNote.subtitle')}
      journeyId={journeyId}
      title={t('quickNote.title')}
    >
      <QuickNotePage journeyId={journeyId} />
    </JourneyOwnerFrame>
  )
}
