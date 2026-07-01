import { z } from 'zod'
import { checklistItemCategorySchema } from '@/entities/checklist/model/checklist'

export const observationConfidenceSchema = z.enum(['seen', 'heard', 'unsure'])

export type ObservationConfidence = z.infer<typeof observationConfidenceSchema>

export const natureObservationSchema = z.object({
  category: checklistItemCategorySchema,
  checklistItemId: z.uuid().nullable(),
  commonName: z.string(),
  confidence: observationConfidenceSchema,
  entryId: z.uuid().nullable(),
  externalId: z.string().nullable(),
  externalSource: z.string().nullable(),
  id: z.uuid(),
  journeyId: z.uuid(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  notes: z.string(),
  observedAt: z.iso.datetime({ offset: true }).nullable(),
  photoId: z.uuid().nullable(),
  scientificName: z.string().nullable(),
})

export type NatureObservation = z.infer<typeof natureObservationSchema>

export const localNatureObservationSchema = z.object({
  category: checklistItemCategorySchema,
  checklistItemId: z.uuid().nullable(),
  commonName: z.string(),
  confidence: observationConfidenceSchema,
  creatorId: z.uuid(),
  entryId: z.uuid().nullable(),
  externalId: z.string().nullable(),
  externalSource: z.string().nullable(),
  id: z.uuid(),
  journeyId: z.uuid(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  notes: z.string(),
  observedAt: z.iso.datetime({ offset: true }).nullable(),
  photoId: z.uuid().nullable(),
  scientificName: z.string().nullable(),
  syncStatus: z.enum(['pending', 'synced']),
  updatedAt: z.iso.datetime({ offset: true }),
})

export type LocalNatureObservation = z.infer<
  typeof localNatureObservationSchema
>

export const regionalSpeciesSchema = z.object({
  commonName: z.string(),
  occurrenceCount: z.number().int().nonnegative(),
  scientificName: z.string().nullable(),
  source: z.literal('gbif'),
  taxonKey: z.number().int().positive(),
})

export type RegionalSpecies = z.infer<typeof regionalSpeciesSchema>
