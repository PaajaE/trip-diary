import type { TFunction } from 'i18next'
import type { SessionStop } from '@/features/journey-flow/model/sort-session'
import { stopNameText } from '@/features/journey-workspace/lib/moment-labels'

/** "5 · Mistaya Canyon", or "Cestou" for a ride (no number, as in Kontrola). */
export function stopTitle(
  stop: SessionStop,
  t: TFunction,
  locale: string,
): string {
  if (stop.number === null) return t('flow.review.enRoute')
  return t('flow.sort.stopChip', {
    name: stopNameText(stop.stop.name, t, locale).text,
    number: stop.number,
  })
}
