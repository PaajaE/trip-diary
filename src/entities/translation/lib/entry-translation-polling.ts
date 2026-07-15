import type { EntryTranslation } from '@trip-diary/translation'

/** Poll while backend status is in-flight. 3s balances UI freshness vs request load. */
export const ENTRY_TRANSLATION_POLL_INTERVAL_MS = 3_000

export function shouldPollEntryTranslation(
  translation: EntryTranslation | null | undefined,
): boolean {
  return (
    translation?.status === 'pending' || translation?.status === 'processing'
  )
}
