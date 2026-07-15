import { useQuery } from '@tanstack/react-query'
import type { TranslationLocale } from '@trip-diary/translation'
import { getEntryTranslation } from '@/entities/translation/api/translation.repository'
import { translationQueryKeys } from '@/entities/translation/api/translation-query-keys'
import {
  ENTRY_TRANSLATION_POLL_INTERVAL_MS,
  shouldPollEntryTranslation,
} from '@/entities/translation/lib/entry-translation-polling'

export function useEntryTranslationQuery(
  entryId: string,
  targetLocale: TranslationLocale = 'en',
  enabled = true,
) {
  return useQuery({
    enabled,
    placeholderData: (previousData) => previousData,
    queryFn: () => getEntryTranslation(entryId, targetLocale),
    queryKey: translationQueryKeys.detail(entryId, targetLocale),
    refetchInterval: (query) =>
      shouldPollEntryTranslation(query.state.data)
        ? ENTRY_TRANSLATION_POLL_INTERVAL_MS
        : false,
  })
}
