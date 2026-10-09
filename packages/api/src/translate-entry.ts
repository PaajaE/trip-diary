import type { SupabaseClient } from '@supabase/supabase-js'
import {
  translateEntryErrorSchema,
  translateEntryResponseSchema,
  type TranslateEntryResponse,
  type TranslationRequest,
} from '@trip-diary/translation'

/**
 * Invokes the `translate-entry` edge function through a shared client.
 * Platform repositories pass their configured Supabase client.
 */
export async function invokeTranslateEntry(
  client: SupabaseClient,
  request: TranslationRequest,
): Promise<TranslateEntryResponse> {
  const result = await client.functions.invoke('translate-entry', {
    body: request,
  })

  if (result.error !== null) {
    const message =
      result.error instanceof Error
        ? result.error.message
        : 'translation_invoke_failed'
    throw new Error(message)
  }

  const response = translateEntryResponseSchema.safeParse(result.data)
  if (response.success) {
    return response.data
  }

  const error = translateEntryErrorSchema.safeParse(result.data)
  if (error.success) {
    throw new Error(error.data.error)
  }

  throw new Error('invalid_translation_response')
}
