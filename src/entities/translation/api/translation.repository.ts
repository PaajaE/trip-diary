import {
  entryTranslationSchema,
  translateEntryErrorSchema,
  translateEntryResponseSchema,
  type EntryTranslation,
  type TranslateEntryResponse,
  type TranslationLocale,
  type TranslationRequest,
} from '@trip-diary/translation'
import { getSupabaseClient } from '@/shared/api/supabase'

const ENGLISH_TARGET_LOCALE = 'en' as const satisfies TranslationLocale

export async function getEntryTranslation(
  entryId: string,
  targetLocale: TranslationLocale = ENGLISH_TARGET_LOCALE,
): Promise<EntryTranslation | null> {
  const { data, error } = await getSupabaseClient()
    .from('entry_translations')
    .select('*')
    .eq('entry_id', entryId)
    .eq('target_locale', targetLocale)
    .maybeSingle()

  if (error !== null) {
    throw error
  }

  if (data === null) {
    return null
  }

  return entryTranslationSchema.parse(data)
}

export async function saveEntryTranslationEdits(
  translationId: string,
  input: {
    translated_body: string
    translated_title: string | null
  },
): Promise<EntryTranslation> {
  const now = new Date().toISOString()
  const { data, error } = await getSupabaseClient()
    .from('entry_translations')
    .update({
      edited_at: now,
      is_manually_edited: true,
      translated_body: input.translated_body,
      translated_title: input.translated_title,
      updated_at: now,
    })
    .eq('id', translationId)
    .select('*')
    .single()

  if (error !== null) {
    throw error
  }

  return entryTranslationSchema.parse(data)
}

export async function requestEntryTranslation(
  request: TranslationRequest,
): Promise<TranslateEntryResponse> {
  const result = await getSupabaseClient().functions.invoke('translate-entry', {
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

export async function refreshEntryTranslation(
  entryId: string,
  targetLocale: TranslationLocale = ENGLISH_TARGET_LOCALE,
): Promise<EntryTranslation | null> {
  await requestEntryTranslation({
    entry_id: entryId,
    target_locale: targetLocale,
  })
  return getEntryTranslation(entryId, targetLocale)
}
