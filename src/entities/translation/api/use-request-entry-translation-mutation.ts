import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TranslationLocale } from '@trip-diary/translation'
import { requestEntryTranslation } from '@/entities/translation/api/translation.repository'
import { translationQueryKeys } from '@/entities/translation/api/translation-query-keys'

interface RequestEntryTranslationInput {
  entryId: string
  force?: boolean
  targetLocale?: TranslationLocale
}

export function useRequestEntryTranslationMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      entryId,
      force = false,
      targetLocale = 'en',
    }: RequestEntryTranslationInput) =>
      requestEntryTranslation({
        entry_id: entryId,
        force,
        target_locale: targetLocale,
      }),
    onSuccess: (_response, variables) => {
      void queryClient.invalidateQueries({
        queryKey: translationQueryKeys.detail(
          variables.entryId,
          variables.targetLocale ?? 'en',
        ),
      })
    },
  })
}
