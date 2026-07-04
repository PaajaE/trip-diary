import type { TFunction } from 'i18next'
import type { JourneyStageContent } from '@/features/journeys/lib/journey-content'

export const UNDATED_DAY_KEY = 'undated' as const

export function getMomentDayKey(eventAt: string | null): string {
  if (eventAt === null) {
    return UNDATED_DAY_KEY
  }

  const date = new Date(eventAt)
  if (Number.isNaN(date.getTime())) {
    return UNDATED_DAY_KEY
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatJourneyDayLabel(dayKey: string, locale: string): string {
  if (dayKey === UNDATED_DAY_KEY) {
    return dayKey
  }

  const [yearText, monthText, dayText] = dayKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return dayKey
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(
    new Date(year, month - 1, day),
  )
}

export function getJourneyStageContentLabel(
  content: JourneyStageContent,
  t: TFunction,
  locale: string,
): string {
  if (content.stage !== null) {
    return content.stage.title
  }

  if (content.dayKey === UNDATED_DAY_KEY) {
    return t('journey.undatedMoments')
  }

  if (content.dayKey !== null) {
    return formatJourneyDayLabel(content.dayKey, locale)
  }

  return t('journey.unassignedPlaces')
}

export function getJourneyStageContentKey(content: JourneyStageContent): string {
  if (content.stage !== null) {
    return `stage-${content.stage.id}`
  }

  if (content.dayKey !== null) {
    return `day-${content.dayKey}`
  }

  return 'unassigned-planned'
}

export function shouldShowJourneyStageHeader(content: JourneyStageContent): boolean {
  return (
    content.stage !== null ||
    content.dayKey !== null ||
    content.plannedStops.length > 0
  )
}

export function eventAtForDayKey(
  dayKey: string,
  existingEventAt: string | null,
): string | null {
  if (dayKey === UNDATED_DAY_KEY) {
    return existingEventAt
  }

  const [yearText, monthText, dayText] = dayKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return existingEventAt
  }

  if (existingEventAt === null) {
    return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString()
  }

  const existing = new Date(existingEventAt)
  if (Number.isNaN(existing.getTime())) {
    return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString()
  }

  return new Date(
    year,
    month - 1,
    day,
    existing.getHours(),
    existing.getMinutes(),
    existing.getSeconds(),
    existing.getMilliseconds(),
  ).toISOString()
}

export type JourneyMomentGroupTarget =
  | { kind: 'day'; dayKey: string }
  | { kind: 'stage'; stageId: string }

export function parseJourneyMomentGroupTarget(
  value: string,
): JourneyMomentGroupTarget | null {
  if (value.startsWith('stage:')) {
    return { kind: 'stage', stageId: value.slice('stage:'.length) }
  }

  if (value.startsWith('day:')) {
    return { kind: 'day', dayKey: value.slice('day:'.length) }
  }

  return null
}

export function formatJourneyMomentGroupTarget(
  target: JourneyMomentGroupTarget,
): string {
  return target.kind === 'stage'
    ? `stage:${target.stageId}`
    : `day:${target.dayKey}`
}

export function getCurrentMomentGroupTarget(input: {
  eventAt: string | null
  stageId: string | null
  validStageIds: Set<string>
}): string {
  if (input.stageId !== null && input.validStageIds.has(input.stageId)) {
    return formatJourneyMomentGroupTarget({
      kind: 'stage',
      stageId: input.stageId,
    })
  }

  return formatJourneyMomentGroupTarget({
    dayKey: getMomentDayKey(input.eventAt),
    kind: 'day',
  })
}
