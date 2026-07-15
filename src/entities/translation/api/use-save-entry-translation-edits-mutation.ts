import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  EntryTranslation,
  TranslationLocale,
} from '@trip-diary/translation'
import { saveEntryTranslationEdits } from '@/entities/translation/api/translation.repository'
import { translationQueryKeys } from '@/entities/translation/api/translation-query-keys'

interface SaveEntryTranslationEditsInput {
  entryId: string
  targetLocale?: TranslationLocale
  translatedBody: string
  translatedTitle: string | null
  translationId: string
}

export function useSaveEntryTranslationEditsMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      translatedBody,
      translatedTitle,
      translationId,
    }: SaveEntryTranslationEditsInput) =>
      saveEntryTranslationEdits(translationId, {
        translated_body: translatedBody,
        translated_title: translatedTitle,
      }),
    onSuccess: (saved, variables) => {
      queryClient.setQueryData<EntryTranslation | null>(
        translationQueryKeys.detail(
          variables.entryId,
          variables.targetLocale ?? 'en',
        ),
        saved,
      )
    },
  })
}
