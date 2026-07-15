import { z } from 'zod'

export const TRANSLATION_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'failed',
  'stale',
] as const

export const translationStatusSchema = z.enum(TRANSLATION_STATUSES)

export type TranslationStatus = z.infer<typeof translationStatusSchema>

export const translationLocaleSchema = z.enum(['cs', 'en'])

export type TranslationLocale = z.infer<typeof translationLocaleSchema>

const dateTimeSchema = z.iso.datetime({ offset: true })

export const entryTranslationSchema = z.object({
  completed_at: dateTimeSchema.nullable(),
  created_at: dateTimeSchema,
  edited_at: dateTimeSchema.nullable(),
  entry_id: z.uuid(),
  error_message: z.string().nullable(),
  id: z.uuid(),
  is_manually_edited: z.boolean(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  requested_at: dateTimeSchema,
  source_content_hash: z.string().nullable(),
  source_locale: translationLocaleSchema,
  source_version: z.number().int().positive().nullable(),
  status: translationStatusSchema,
  target_locale: translationLocaleSchema,
  translated_body: z.string().max(50_000),
  translated_title: z.string().max(160).nullable(),
  updated_at: dateTimeSchema,
})

export type EntryTranslation = z.infer<typeof entryTranslationSchema>

export const translationRequestSchema = z.object({
  entry_id: z.uuid(),
  force: z.boolean().optional(),
  target_locale: translationLocaleSchema,
})

export type TranslationRequest = z.infer<typeof translationRequestSchema>

export const translateEntryResponseSchema = z.object({
  entry_id: z.uuid(),
  model: z.string(),
  provider: z.string(),
  source_locale: translationLocaleSchema,
  status: z.literal('succeeded'),
  target_locale: translationLocaleSchema,
  translated_body: z.string().max(50_000),
  translated_title: z.string().max(160).nullable(),
})

export type TranslateEntryResponse = z.infer<
  typeof translateEntryResponseSchema
>

export const translateEntryErrorSchema = z.object({
  error: z.string(),
})

export type TranslateEntryError = z.infer<typeof translateEntryErrorSchema>

export type TranslationDisplayStatus = TranslationStatus | 'none'
