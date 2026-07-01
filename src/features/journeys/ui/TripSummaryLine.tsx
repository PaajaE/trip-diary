import { useTranslation } from 'react-i18next'

interface TripSummaryLineProps {
  mapPointCount: number
  momentCount: number
  natureChecked?: number
  natureTotal?: number
  photoCount: number
}

export function TripSummaryLine({
  mapPointCount,
  momentCount,
  natureChecked = 0,
  natureTotal = 0,
  photoCount,
}: TripSummaryLineProps) {
  const { t } = useTranslation()

  const parts = [
    t('journey.summaryLineMoments', { count: momentCount }),
    t('journey.summaryLinePhotos', { count: photoCount }),
    mapPointCount > 0
      ? t('journey.summaryLineMap', { count: mapPointCount })
      : null,
    natureTotal > 0
      ? t('journey.summaryLineNature', {
          checked: natureChecked,
          total: natureTotal,
        })
      : null,
  ].filter((part): part is string => part !== null)

  return (
    <p className="text-sm leading-6 text-muted" role="status">
      {parts.join(' · ')}
    </p>
  )
}
