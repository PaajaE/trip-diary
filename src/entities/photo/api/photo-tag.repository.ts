import { normalizePhotoTagSlug } from '@/entities/photo/lib/normalize-photo-tag'
import {
  journeyPhotoTagSchema,
  photoTagAssignmentSchema,
  type JourneyPhotoTag,
  type PhotoTagAssignment,
} from '@/entities/photo/model/photo-tag'
import { getSupabaseClient } from '@/shared/api/supabase'

export async function listJourneyPhotoTags(
  journeyId: string,
): Promise<JourneyPhotoTag[]> {
  const { data: tags, error: tagsError } = await getSupabaseClient()
    .from('journey_photo_tags')
    .select('id, slug, label')
    .eq('journey_id', journeyId)
    .order('label')

  if (tagsError !== null) {
    throw tagsError
  }
  if (tags.length === 0) {
    return []
  }

  const tagIds = tags.map((tag) => tag.id)
  const { data: assignments, error: assignmentsError } = await getSupabaseClient()
    .from('photo_tag_assignments')
    .select('tag_id')
    .in('tag_id', tagIds)

  if (assignmentsError !== null) {
    throw assignmentsError
  }

  const countsByTagId = new Map<string, number>()
  for (const assignment of assignments ?? []) {
    countsByTagId.set(
      assignment.tag_id,
      (countsByTagId.get(assignment.tag_id) ?? 0) + 1,
    )
  }

  return tags
    .map((tag) =>
      journeyPhotoTagSchema.parse({
        id: tag.id,
        label: tag.label,
        photoCount: countsByTagId.get(tag.id) ?? 0,
        slug: tag.slug,
      }),
    )
    .filter((tag) => tag.photoCount > 0)
    .sort((left, right) => right.photoCount - left.photoCount)
}

export async function listJourneyPhotoTagAssignments(
  journeyId: string,
): Promise<PhotoTagAssignment[]> {
  const { data: tags, error: tagsError } = await getSupabaseClient()
    .from('journey_photo_tags')
    .select('id, slug, label')
    .eq('journey_id', journeyId)

  if (tagsError !== null) {
    throw tagsError
  }
  if (tags.length === 0) {
    return []
  }

  const tagsById = new Map(tags.map((tag) => [tag.id, tag]))
  const { data: assignments, error: assignmentsError } = await getSupabaseClient()
    .from('photo_tag_assignments')
    .select('photo_id, tag_id')
    .in(
      'tag_id',
      tags.map((tag) => tag.id),
    )

  if (assignmentsError !== null) {
    throw assignmentsError
  }

  return (assignments ?? []).flatMap((assignment) => {
    const tag = tagsById.get(assignment.tag_id)
    if (tag === undefined) {
      return []
    }
    return [
      photoTagAssignmentSchema.parse({
        label: tag.label,
        photoId: assignment.photo_id,
        slug: tag.slug,
        tagId: tag.id,
      }),
    ]
  })
}

export async function listPhotoTagAssignmentsForPhotos(
  journeyId: string,
  photoIds: string[],
): Promise<PhotoTagAssignment[]> {
  if (photoIds.length === 0) {
    return []
  }

  const all = await listJourneyPhotoTagAssignments(journeyId)
  const photoIdSet = new Set(photoIds)
  return all.filter((assignment) => photoIdSet.has(assignment.photoId))
}

async function ensureJourneyPhotoTag(journeyId: string, label: string) {
  const slug = normalizePhotoTagSlug(label)
  const trimmedLabel = label.trim()
  const client = getSupabaseClient()

  const { data: existing, error: existingError } = await client
    .from('journey_photo_tags')
    .select('id, slug, label')
    .eq('journey_id', journeyId)
    .eq('slug', slug)
    .maybeSingle()

  if (existingError !== null) {
    throw existingError
  }
  if (existing !== null) {
    return existing
  }

  const { data: created, error: createError } = await client
    .from('journey_photo_tags')
    .insert({
      journey_id: journeyId,
      label: trimmedLabel,
      slug,
    })
    .select('id, slug, label')
    .single()

  if (createError !== null) {
    throw createError
  }
  return created
}

export async function assignPhotoTag(input: {
  creatorId: string
  journeyId: string
  label: string
  photoId: string
}): Promise<void> {
  const tag = await ensureJourneyPhotoTag(input.journeyId, input.label)
  const { error } = await getSupabaseClient()
    .from('photo_tag_assignments')
    .upsert(
      {
        creator_id: input.creatorId,
        photo_id: input.photoId,
        tag_id: tag.id,
      },
      { onConflict: 'photo_id,tag_id', ignoreDuplicates: true },
    )

  if (error !== null) {
    throw error
  }
}

export async function removePhotoTag(input: {
  creatorId: string
  journeyId: string
  photoId: string
  slug: string
}): Promise<void> {
  const { data: tag, error: tagError } = await getSupabaseClient()
    .from('journey_photo_tags')
    .select('id')
    .eq('journey_id', input.journeyId)
    .eq('slug', input.slug)
    .maybeSingle()

  if (tagError !== null) {
    throw tagError
  }
  if (tag === null) {
    return
  }

  const { error } = await getSupabaseClient()
    .from('photo_tag_assignments')
    .delete()
    .eq('photo_id', input.photoId)
    .eq('tag_id', tag.id)
    .eq('creator_id', input.creatorId)

  if (error !== null) {
    throw error
  }
}
