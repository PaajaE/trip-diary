import { z } from 'zod'

export const entryTypeSchema = z.enum(['story', 'tip', 'note', 'place'])
export const entryLanguageSchema = z.enum(['cs', 'en'])
export const entryVisibilitySchema = z.enum(['public', 'private'])
export const entryStatusSchema = z.enum(['draft', 'published'])
export const entrySyncStatusSchema = z.enum([
  'local',
  'pending',
  'syncing',
  'synced',
  'failed',
])
const dateTimeSchema = z.iso.datetime({ offset: true })

export const entrySchema = z.object({
  body: z.string().max(50_000),
  createdAt: dateTimeSchema,
  creatorId: z.uuid(),
  eventAt: dateTimeSchema,
  id: z.uuid(),
  language: entryLanguageSchema,
  publishedAt: dateTimeSchema.nullable(),
  slug: z
    .string()
    .min(3)
    .max(80)
    .nullish()
    .transform((value) => value ?? null),
  spaceId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  status: entryStatusSchema,
  syncStatus: entrySyncStatusSchema,
  title: z.string().min(1).max(160),
  type: entryTypeSchema,
  updatedAt: dateTimeSchema,
  version: z.number().int().positive(),
  visibility: entryVisibilitySchema,
})

export type Entry = z.infer<typeof entrySchema>

export const createEntrySchema = z.object({
  body: z.string().max(50_000),
  eventAt: dateTimeSchema,
  language: entryLanguageSchema,
  title: z.string().min(1).max(160),
  type: entryTypeSchema,
  visibility: entryVisibilitySchema,
})

export type CreateEntryInput = z.infer<typeof createEntrySchema>

export const updateEntrySchema = createEntrySchema

export type UpdateEntryInput = z.infer<typeof updateEntrySchema>
