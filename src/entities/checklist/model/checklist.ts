import { z } from 'zod'

export const checklistItemCategorySchema = z.enum([
  'wildlife',
  'flora',
  'geology',
  'landmark',
  'general',
])

export type ChecklistItemCategory = z.infer<typeof checklistItemCategorySchema>

export const checklistTemplateItemSchema = z.object({
  category: checklistItemCategorySchema,
  createPlannedStop: z.boolean().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  notesKey: z.string().optional(),
  slug: z.string(),
  titleKey: z.string(),
})

export type ChecklistTemplateItem = z.infer<typeof checklistTemplateItemSchema>

export const checklistTemplateSchema = z.object({
  descriptionKey: z.string(),
  items: z.array(checklistTemplateItemSchema),
  regionKey: z.string(),
  slug: z.string(),
  titleKey: z.string(),
})

export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>

export const journeyChecklistItemSchema = z.object({
  category: checklistItemCategorySchema,
  checkedAt: z.iso.datetime({ offset: true }).nullable(),
  entryId: z.uuid().nullable(),
  id: z.uuid(),
  itemSlug: z.string(),
  notes: z.string(),
  position: z.number().int().nonnegative(),
  stopId: z.uuid().nullable(),
  templateSlug: z.string(),
  title: z.string(),
})

export type JourneyChecklistItem = z.infer<typeof journeyChecklistItemSchema>

export const localChecklistItemSchema = z.object({
  category: checklistItemCategorySchema,
  checkedAt: z.iso.datetime({ offset: true }).nullable(),
  creatorId: z.uuid(),
  entryId: z.uuid().nullable(),
  id: z.uuid(),
  itemSlug: z.string(),
  journeyId: z.uuid(),
  notes: z.string(),
  position: z.number().int().nonnegative(),
  stopId: z.uuid().nullable(),
  syncStatus: z.enum(['pending', 'synced']),
  templateSlug: z.string(),
  title: z.string(),
  updatedAt: z.iso.datetime({ offset: true }),
})

export type LocalChecklistItem = z.infer<typeof localChecklistItemSchema>
