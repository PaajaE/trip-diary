import type { TFunction } from 'i18next'
import type { PublicMoment } from '@trip-diary/core/public-journey'
import {
  formatInZone,
  type JourneyModel,
  zoneOf,
} from '@/entities/public-journey/lib/journey-model'

const MAX_TITLE = 60

/** First sentence of a text, shortened to a title length; '' when empty. */
export function firstSentence(body: string, max = MAX_TITLE): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat === '') return ''
  const end = flat.search(/[.!?…](\s|$)/)
  const sentence = end === -1 ? flat : flat.slice(0, end)
  return sentence.length <= max
    ? sentence
    : `${sentence.slice(0, max - 1).trimEnd()}…`
}

/**
 * Name of a moment for lists, headings and the page title: its title, else
 * the first sentence of its text, else its place, else "Stop 11:15". Never a
 * bare "Moment".
 */
export function publicMomentTitle(
  model: JourneyModel,
  moment: PublicMoment,
  t: TFunction,
  locale: string,
): string {
  const title = moment.title?.trim() ?? ''
  if (title !== '') return title
  const sentence = firstSentence(moment.body)
  if (sentence !== '') return sentence
  const place =
    moment.placeId === null
      ? undefined
      : model.placeById.get(moment.placeId)?.name.trim()
  if (place !== undefined && place !== '') return place
  const zone = zoneOf(model, model.segmentOfInstant(moment.startsAt))
  return t('publicJourney.untitledMoment', {
    time: formatInZone(moment.startsAt, zone, locale, {
      hour: '2-digit',
      minute: '2-digit',
    }),
  })
}
