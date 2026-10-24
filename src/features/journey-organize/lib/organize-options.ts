import type { TFunction } from 'i18next'
import type { OrganizeDeps } from '@/features/journey-organize/api/organize-journey'

/** Localised names for the moments and segments the organize step creates. */
export function organizeOptions(
  t: TFunction,
  language: string,
): Pick<OrganizeDeps, 'labels' | 'segmentTitle'> {
  return {
    labels: {
      locale: language,
      and: (first, second) => t('autoOrganize.names.and', { first, second }),
      dayTrip: (name) => t('autoOrganize.names.dayTrip', { name }),
      repeat: (title, count) =>
        t('autoOrganize.names.repeat', { count, title }),
      stay: (name) => t('autoOrganize.names.stay', { name }),
      travel: (from, to) => t('autoOrganize.names.travel', { from, to }),
      trek: (name) => t('autoOrganize.names.trek', { name }),
      trekAround: (name) => t('autoOrganize.names.trekAround', { name }),
    },
    segmentTitle: ({ index, kind, stageKind, tripType }) =>
      kind === 'stage' || tripType === null
        ? stageKind === null
          ? t('autoOrganize.stageTitle', { index })
          : t(`autoOrganize.stageKindTitle.${stageKind}`, { index })
        : t(`autoOrganize.tripTitle.${tripType}`, { index }),
  }
}
