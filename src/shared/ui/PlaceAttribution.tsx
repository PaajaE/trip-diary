import { useTranslation } from 'react-i18next'

/** Required credit wherever place names from Mapy.com (resolve-place) are shown. */
export function PlaceAttribution() {
  const { t } = useTranslation()
  return (
    <a
      className="text-xs underline"
      href="https://mapy.com"
      rel="noopener noreferrer"
      target="_blank"
    >
      {t('common.placeAttribution')}
    </a>
  )
}
