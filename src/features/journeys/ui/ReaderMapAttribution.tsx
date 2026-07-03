import { useTranslation } from 'react-i18next'
import { isMapyBasemapEnabled } from '@/shared/lib/map-style'

export function ReaderMapAttribution() {
  const { t } = useTranslation()

  if (!isMapyBasemapEnabled()) {
    return (
      <p className="mt-3 text-xs leading-5 text-muted">
        {t('reader.mapAttributionOsm')}
      </p>
    )
  }

  return (
    <p className="mt-3 text-xs leading-5 text-muted">
      {t('reader.mapAttributionMapy')}
    </p>
  )
}
