import type { TFunction } from 'i18next'

function csPlural(
  count: number,
  one: string,
  few: string,
  other: string,
): string {
  if (count === 1) {
    return one
  }
  if (count >= 2 && count <= 4) {
    return few
  }
  return other
}

export function formatTripSummaryParts(
  t: TFunction,
  {
    mapPointCount,
    momentCount,
    natureChecked = 0,
    natureTotal = 0,
    photoCount,
  }: {
    mapPointCount: number
    momentCount: number
    natureChecked?: number
    natureTotal?: number
    photoCount: number
  },
  language: string,
): string[] {
  const isCzech = language.startsWith('cs')

  const moments = isCzech
    ? csPlural(
        momentCount,
        t('journey.summaryLineMomentsOne', { count: momentCount }),
        t('journey.summaryLineMomentsFew', { count: momentCount }),
        t('journey.summaryLineMomentsMany', { count: momentCount }),
      )
    : t(
        momentCount === 1
          ? 'journey.summaryLineMomentsOne'
          : 'journey.summaryLineMomentsMany',
        { count: momentCount },
      )

  const photos = isCzech
    ? csPlural(
        photoCount,
        t('journey.summaryLinePhotosOne', { count: photoCount }),
        t('journey.summaryLinePhotosFew', { count: photoCount }),
        t('journey.summaryLinePhotosMany', { count: photoCount }),
      )
    : t(
        photoCount === 1
          ? 'journey.summaryLinePhotosOne'
          : 'journey.summaryLinePhotosMany',
        { count: photoCount },
      )

  const parts = [moments, photos]

  if (mapPointCount > 0) {
    parts.push(t('journey.summaryLineMap', { count: mapPointCount }))
  }

  if (natureTotal > 0) {
    parts.push(
      t('journey.summaryLineNature', {
        checked: natureChecked,
        total: natureTotal,
      }),
    )
  }

  return parts
}
