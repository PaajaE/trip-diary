export function countJourneyDays(
  startsAt: string | null,
  endsAt: string | null,
): number | null {
  if (startsAt === null || endsAt === null) {
    return null
  }

  const start = parseJourneyDate(startsAt)
  const end = parseJourneyDate(endsAt)
  if (start === null || end === null || end < start) {
    return null
  }

  const days = Math.round((end - start) / 86_400_000) + 1
  return days > 0 ? days : null
}

function parseJourneyDate(value: string): number | null {
  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  const time = parsed.getTime()
  return Number.isNaN(time) ? null : time
}
