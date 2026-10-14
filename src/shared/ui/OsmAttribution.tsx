import { useTranslation } from 'react-i18next'

/** Required credit wherever OpenStreetMap-derived data (Nominatim) is shown. */
export function OsmAttribution() {
  const { t } = useTranslation()
  return (
    <a
      className="text-xs underline"
      href="https://www.openstreetmap.org/copyright"
      rel="noopener noreferrer"
      target="_blank"
    >
      {t('common.osmAttribution')}
    </a>
  )
}
