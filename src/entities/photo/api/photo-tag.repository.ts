import { normalizePhotoTagSlug } from '@/entities/photo/lib/normalize-photo-tag'
import {
  listLocalPhotoTagAssignments,
  listPendingPhotoTagRemoveKeys,
} from '@/entities/photo/api/local-photo-tag.repository'
import {
  journeyPhotoTagSchema,
  photoTagAssignmentSchema,
  type JourneyPhotoTag,
  type PhotoTagAssignment,
} from '@/entities/photo/model/photo-tag'
import { getSupabaseClient } from '@/shared/api/supabase'
import { isBrowserOnline } from '@/shared/lib/network'

function mergePhotoTagAssignments(
  remote: PhotoTagAssignment[],
  local: PhotoTagAssignment[],
  pendingRemoveKeys: Set<string>,
): PhotoTagAssignment[] {
  const merged = new Map<string, PhotoTagAssignment>()

  for (const assignment of remote) {
    merged.set(`${assignment.photoId}:${assignment.slug}`, assignment)
  }
  for (const assignment of local) {
    merged.set(`${assignment.photoId}:${assignment.slug}`, assignment)
  }
  for (const key of pendingRemoveKeys) {
    merged.delete(key)
  }

  return Array.from(merged.values())
}

export async function listJourneyPhotoTags(
  journeyId: string,
): Promise<JourneyPhotoTag[]> {
  const assignments = await listJourneyPhotoTagAssignments(journeyId)
  const countsBySlug = new Map<string, { label: string; photoCount: number }>()

  for (const assignment of assignments) {
    const current = countsBySlug.get(assignment.slug)
    countsBySlug.set(assignment.slug, {
      label: assignment.label,
      photoCount: (current?.photoCount ?? 0) + 1,
    })
  }

  return Array.from(countsBySlug.entries())
    .map(([slug, value]) =>
      journeyPhotoTagSchema.parse({
        id: crypto.randomUUID(),
        label: value.label,
        photoCount: value.photoCount,
        slug,
      }),
    )
    .filter((tag) => tag.photoCount > 0)
    .sort((left, right) => right.photoCount - left.photoCount)
}

export async function listJourneyPhotoTagAssignments(
  journeyId: string,
): Promise<PhotoTagAssignment[]> {
  const local = await listLocalPhotoTagAssignments(journeyId)
  const pendingRemoveKeys = await listPendingPhotoTagRemoveKeys(journeyId)

  if (!isBrowserOnline()) {
    return mergePhotoTagAssignments([], local, pendingRemoveKeys)
  }

  try {
    const remote = await listJourneyPhotoTagAssignmentsRemote(journeyId)
    return mergePhotoTagAssignments(remote, local, pendingRemoveKeys)
  } catch {
    return mergePhotoTagAssignments([], local, pendingRemoveKeys)
  }
}

async function listJourneyPhotoTagAssignmentsRemote(
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
  const { data: assignments, error: assignmentsError } =
    await getSupabaseClient()
      .from('photo_tag_assignments')
      .select('photo_id, tag_id')
      .in(
        'tag_id',
        tags.map((tag) => tag.id),
      )

  if (assignmentsError !== null) {
    throw assignmentsError
  }

  return assignments.flatMap((assignment) => {
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

export async function assignPhotoTagRemote(input: {
  creatorId: string
  journeyId: string
  label: string
  photoId: string
}): Promise<{ id: string; label: string; slug: string }> {
  const tag = await ensureJourneyPhotoTag(input.journeyId, input.label)
  const { error } = await getSupabaseClient()
    .from('photo_tag_assignments')
    .upsert(
      {
        creator_id: input.creatorId,
        photo_id: input.photoId,
        tag_id: tag.id,
      },
      { ignoreDuplicates: true, onConflict: 'photo_id,tag_id' },
    )

  if (error !== null) {
    throw error
  }

  return tag
}

export async function removePhotoTagRemote(input: {
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
