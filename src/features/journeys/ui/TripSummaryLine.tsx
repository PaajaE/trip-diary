import { useTranslation } from 'react-i18next'
import { formatTripSummaryParts } from '@/features/journeys/lib/format-trip-summary'

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
  const { i18n, t } = useTranslation()

  const parts = formatTripSummaryParts(
    t,
    {
      mapPointCount,
      momentCount,
      natureChecked,
      natureTotal,
      photoCount,
    },
    i18n.language,
  )

  return (
    <p className="text-sm leading-6 text-muted" role="status">
      {parts.join(' · ')}
    </p>
  )
}
