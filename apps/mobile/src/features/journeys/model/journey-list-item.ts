import {
  parseJourneyListItemFromRemoteRecord,
  safeParseJourneyListItemPayload,
  type JourneyListItem,
} from '@trip-diary/core/journey'

export type { JourneyListItem, JourneyStatus } from '@trip-diary/core/journey'

export {
  journeyListItemSchema,
  parseJourneyListItemFromRemoteRecord,
  safeParseJourneyListItemPayload,
  serializeJourneyListItemToLegacyCachePayload,
} from '@trip-diary/core/journey'

/** @deprecated Use JourneyListItem from @trip-diary/core/journey */
export type JourneyListStatus = JourneyListItem['status']

/** @deprecated Use JourneyListItem from @trip-diary/core/journey */
export type CachedJourneyListItem = JourneyListItem

export function toJourneyListItem(item: JourneyListItem): JourneyListItem {
  return item
}

export function parseCachedJourneyListItem(
  payload: unknown,
): JourneyListItem | null {
  return safeParseJourneyListItemPayload(payload)
}

export function assertCachedJourneyListItem(
  item: JourneyListItem,
): JourneyListItem {
  const parsed = safeParseJourneyListItemPayload(item)
  if (parsed === null) {
    throw new Error('Invalid journey list item.')
  }

  return parsed
}

export function mapRemoteJourneyListRow(
  row: Record<string, unknown>,
): JourneyListItem {
  return parseJourneyListItemFromRemoteRecord(row)
}
