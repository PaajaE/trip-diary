import type { TranslationLocale } from '@trip-diary/translation'

export const translationQueryKeys = {
  all: ['entry-translations'] as const,
  byEntry: (entryId: string) =>
    [...translationQueryKeys.all, entryId] as const,
  detail: (entryId: string, targetLocale: TranslationLocale) =>
    [...translationQueryKeys.byEntry(entryId), targetLocale] as const,
}
