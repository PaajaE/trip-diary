export function resolveDateLocale(language: string): string {
  return language.startsWith('cs') ? 'cs-CZ' : 'en-US'
}

export function formatLocalizedDate(
  isoDate: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
): string {
  const date = new Date(isoDate)

  if (Number.isNaN(date.getTime())) {
    return isoDate
  }

  return new Intl.DateTimeFormat(locale, options).format(date)
}

export function formatJourneyDateRange(
  startsAt: string | null,
  endsAt: string | null,
  locale: string,
  unknownLabel: string,
): string {
  if (startsAt === null && endsAt === null) {
    return unknownLabel
  }

  if (startsAt !== null && endsAt !== null) {
    return `${formatLocalizedDate(startsAt, locale)} – ${formatLocalizedDate(endsAt, locale)}`
  }

  const singleDate = startsAt ?? endsAt
  return singleDate !== null
    ? formatLocalizedDate(singleDate, locale)
    : unknownLabel
}
