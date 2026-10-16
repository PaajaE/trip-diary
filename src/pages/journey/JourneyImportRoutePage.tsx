import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ImportPage } from '@/features/media-import/ui/ImportPage'
import { JourneyOwnerFrame } from '@/pages/journey/JourneyOwnerFrame'

export function JourneyImportRoutePage() {
  const { t } = useTranslation()
  const { journeyId } = useParams({ from: '/j/$journeyId/import' })
  return (
    <JourneyOwnerFrame
      current="import"
      description={t('mediaImport.dropDescription')}
      journeyId={journeyId}
      title={t('mediaImport.title')}
    >
      <ImportPage journeyId={journeyId} />
    </JourneyOwnerFrame>
  )
}
