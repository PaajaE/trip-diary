export function formatMomentTimeLabel(
  eventAt: string | null,
  locale: string,
): string | null {
  if (eventAt === null) {
    return null
  }

  const date = new Date(eventAt)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date)
}

export function formatMomentDateTimeLabel(
  eventAt: string | null,
  locale: string,
): string | null {
  if (eventAt === null) {
    return null
  }

  const date = new Date(eventAt)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatMomentDateLabel(
  eventAt: string | null,
  locale: string,
): string | null {
  if (eventAt === null) {
    return null
  }

  const date = new Date(eventAt)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatMomentTimelineLabel(
  eventAt: string | null,
  locale: string,
  inDayGroup: boolean,
): string | null {
  if (eventAt === null) {
    return null
  }

  return inDayGroup
    ? formatMomentTimeLabel(eventAt, locale)
    : formatMomentDateLabel(eventAt, locale)
}

import type { JourneyStageContent } from '@/features/journeys/lib/journey-content'

export function isAutoDayGroup(
  content: Pick<JourneyStageContent, 'dayKey' | 'stage'>,
): boolean {
  return content.stage === null && content.dayKey !== null
}
