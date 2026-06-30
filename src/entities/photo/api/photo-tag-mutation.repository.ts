import { normalizePhotoTagSlug } from '@/entities/photo/lib/normalize-photo-tag'
import {
  assignLocalPhotoTag,
  clearLocalPhotoTagAssignment,
  removeLocalPhotoTag,
  upsertSyncedLocalPhotoTagAssignment,
} from '@/entities/photo/api/local-photo-tag.repository'
import {
  assignPhotoTagRemote,
  removePhotoTagRemote,
} from '@/entities/photo/api/photo-tag.repository'
import { isBrowserOnline } from '@/shared/lib/network'

export async function assignPhotoTag(input: {
  creatorId: string
  journeyId: string
  label: string
  photoId: string
}): Promise<void> {
  const slug = normalizePhotoTagSlug(input.label)

  if (!isBrowserOnline()) {
    await assignLocalPhotoTag(input)
    return
  }

  try {
    const tag = await assignPhotoTagRemote(input)
    await upsertSyncedLocalPhotoTagAssignment({
      creatorId: input.creatorId,
      journeyId: input.journeyId,
      label: input.label.trim(),
      photoId: input.photoId,
      slug,
      tagId: tag.id,
    })
  } catch {
    await assignLocalPhotoTag(input)
  }
}

export async function removePhotoTag(input: {
  creatorId: string
  journeyId: string
  photoId: string
  slug: string
}): Promise<void> {
  if (!isBrowserOnline()) {
    await removeLocalPhotoTag(input)
    return
  }

  try {
    await removePhotoTagRemote(input)
    await clearLocalPhotoTagAssignment(input.photoId, input.slug)
  } catch {
    await removeLocalPhotoTag(input)
  }
}
