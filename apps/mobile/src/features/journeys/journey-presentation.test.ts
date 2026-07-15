import { beforeEach, describe, expect, it } from 'vitest'
import { formatJourneyDateRange, resolveDateLocale } from '@trip-diary/utils'
import { initI18n, resetI18nForTests } from '@/foundation/i18n/i18n'

describe('journey detail presentation', () => {
  beforeEach(() => {
    resetI18nForTests()
  })

  it('formats journey periods for the active locale', () => {
    const i18n = initI18n('en')
    const formatted = formatJourneyDateRange(
      '2026-07-01T00:00:00.000Z',
      '2026-07-10T00:00:00.000Z',
      resolveDateLocale(i18n.language),
      i18n.t('journey.dateUnknown'),
    )

    expect(formatted).toContain('2026')
    expect(formatted).toContain('–')
  })

  it('uses product language for unknown dates and journey status', () => {
    const i18n = initI18n('cs')
    expect(
      formatJourneyDateRange(
        null,
        null,
        resolveDateLocale(i18n.language),
        i18n.t('journey.dateUnknown'),
      ),
    ).toBe('Datum doplníš později')
    expect(i18n.t('journey.status.active')).toBe('Právě na cestě')
    expect(i18n.t('sync.status.offline')).toContain('Offline')
    expect(i18n.t('mobile.journeyListOfflineSaved')).toContain('Offline')
    expect(i18n.t('mobile.journeyListOfflineUnavailable')).toContain('připojte')
  })

  it('renders English journey-list offline copy', () => {
    const i18n = initI18n('en')
    expect(i18n.t('mobile.journeyListOfflineSaved')).toBe(
      'Offline — showing saved journeys',
    )
    expect(i18n.t('mobile.journeyListRefreshFailed')).toBe(
      'Could not refresh — showing saved journeys',
    )
    expect(i18n.t('mobile.journeyListOfflineUnavailable')).toContain(
      'Connect to the internet',
    )
  })
})
