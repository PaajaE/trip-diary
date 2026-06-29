import { z } from 'zod'

export const journeyPhotoTagSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  photoCount: z.number().int().nonnegative(),
  slug: z.string(),
})

export type JourneyPhotoTag = z.infer<typeof journeyPhotoTagSchema>

export const photoTagAssignmentSchema = z.object({
  label: z.string(),
  photoId: z.uuid(),
  slug: z.string(),
  tagId: z.uuid(),
})

export type PhotoTagAssignment = z.infer<typeof photoTagAssignmentSchema>

export const SUGGESTED_PHOTO_TAG_SLUGS = [
  'wildlife',
  'flowers',
  'landscape',
  'food',
  'architecture',
  'people',
  'sunset',
  'beach',
  'mountains',
  'city',
] as const

export type SuggestedPhotoTagSlug = (typeof SUGGESTED_PHOTO_TAG_SLUGS)[number]
