import { normalizePhotoTagSlug } from '@/entities/photo/lib/normalize-photo-tag'
import {
  localPhotoTagAssignmentSchema,
  photoTagAssignmentSchema,
  type LocalPhotoTagAssignment,
  type PhotoTagAssignment,
} from '@/entities/photo/model/photo-tag'
import { localDb } from '@/shared/lib/local-db'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

function assignmentKey(photoId: string, slug: string) {
  return `${photoId}:${slug}`
}

export async function listLocalPhotoTagAssignments(
  journeyId: string,
): Promise<PhotoTagAssignment[]> {
  const assignments = await localDb.localPhotoTagAssignments
    .where('journeyId')
    .equals(journeyId)
    .toArray()

  return assignments.map((assignment) =>
    photoTagAssignmentSchema.parse({
      label: assignment.label,
      photoId: assignment.photoId,
      slug: assignment.slug,
      tagId: assignment.tagId,
    }),
  )
}

export async function listPendingPhotoTagRemoveKeys(
  journeyId: string,
): Promise<Set<string>> {
  const operations = await localDb.syncOperations
    .filter(
      (operation) =>
        operation.type === 'photo.tag.remove' &&
        operation.journeyId === journeyId &&
        (operation.status === 'pending' || operation.status === 'syncing'),
    )
    .toArray()

  return new Set(
    operations.flatMap((operation) =>
      operation.type === 'photo.tag.remove'
        ? [`${operation.photoId}:${operation.slug}`]
        : [],
    ),
  )
}

async function purgePhotoTagSyncOperations(
  photoId: string,
  slug: string,
): Promise<void> {
  await localDb.syncOperations
    .filter(
      (operation) =>
        (operation.type === 'photo.tag.assign' ||
          operation.type === 'photo.tag.remove') &&
        operation.photoId === photoId &&
        operation.slug === slug,
    )
    .delete()
}

export async function assignLocalPhotoTag(input: {
  creatorId: string
  journeyId: string
  label: string
  photoId: string
}): Promise<void> {
  const slug = normalizePhotoTagSlug(input.label)
  const trimmedLabel = input.label.trim()
  const now = new Date().toISOString()
  const key = assignmentKey(input.photoId, slug)
  const existing = await localDb.localPhotoTagAssignments.get(key)
  const tagId = existing?.tagId ?? crypto.randomUUID()
  const assignment = localPhotoTagAssignmentSchema.parse({
    creatorId: input.creatorId,
    journeyId: input.journeyId,
    key,
    label: trimmedLabel,
    photoId: input.photoId,
    slug,
    syncStatus: 'pending',
    tagId,
  })

  await localDb.transaction(
    'rw',
    localDb.localPhotoTagAssignments,
    localDb.syncOperations,
    async () => {
      await purgePhotoTagSyncOperations(input.photoId, slug)
      await localDb.localPhotoTagAssignments.put(assignment)
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          createdAt: now,
          creatorId: input.creatorId,
          id: crypto.randomUUID(),
          journeyId: input.journeyId,
          label: trimmedLabel,
          photoId: input.photoId,
          slug,
          status: 'pending',
          tagId,
          type: 'photo.tag.assign',
        }),
      )
    },
  )
}

export async function removeLocalPhotoTag(input: {
  creatorId: string
  journeyId: string
  photoId: string
  slug: string
}): Promise<void> {
  const now = new Date().toISOString()
  const key = assignmentKey(input.photoId, input.slug)
  const existing = await localDb.localPhotoTagAssignments.get(key)

  await localDb.transaction(
    'rw',
    localDb.localPhotoTagAssignments,
    localDb.syncOperations,
    async () => {
      await purgePhotoTagSyncOperations(input.photoId, input.slug)
      await localDb.localPhotoTagAssignments.delete(key)

      if (existing?.syncStatus === 'synced') {
        await localDb.syncOperations.add(
          syncOperationSchema.parse({
            createdAt: now,
            creatorId: input.creatorId,
            id: crypto.randomUUID(),
            journeyId: input.journeyId,
            photoId: input.photoId,
            slug: input.slug,
            status: 'pending',
            type: 'photo.tag.remove',
          }),
        )
      }
    },
  )
}

export async function markLocalPhotoTagAssignmentSynced(
  photoId: string,
  slug: string,
  tagId: string,
): Promise<void> {
  const key = assignmentKey(photoId, slug)
  const existing = await localDb.localPhotoTagAssignments.get(key)
  if (existing === undefined) {
    return
  }

  await localDb.localPhotoTagAssignments.put(
    localPhotoTagAssignmentSchema.parse({
      ...existing,
      syncStatus: 'synced',
      tagId,
    }),
  )
}

export async function upsertSyncedLocalPhotoTagAssignment(
  assignment: Omit<LocalPhotoTagAssignment, 'key' | 'syncStatus'> & {
    slug: string
    photoId: string
  },
): Promise<void> {
  await localDb.localPhotoTagAssignments.put(
    localPhotoTagAssignmentSchema.parse({
      ...assignment,
      key: assignmentKey(assignment.photoId, assignment.slug),
      syncStatus: 'synced',
    }),
  )
}

export async function clearLocalPhotoTagAssignment(
  photoId: string,
  slug: string,
): Promise<void> {
  await localDb.localPhotoTagAssignments.delete(assignmentKey(photoId, slug))
}
