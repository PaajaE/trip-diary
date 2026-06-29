import { describe, expect, it } from 'vitest'
import {
  assignLocalPhotoTag,
  listLocalPhotoTagAssignments,
} from '@/entities/photo/api/local-photo-tag.repository'
import { localDb } from '@/shared/lib/local-db'

describe('local-photo-tag.repository', () => {
  it('queues a pending assign operation when tagging offline', async () => {
    const journeyId = crypto.randomUUID()
    const photoId = crypto.randomUUID()
    const creatorId = crypto.randomUUID()

    await assignLocalPhotoTag({
      creatorId,
      journeyId,
      label: 'Wildlife',
      photoId,
    })

    const assignments = await listLocalPhotoTagAssignments(journeyId)
    expect(assignments).toHaveLength(1)
    expect(assignments[0]?.slug).toBe('wildlife')

    const operations = await localDb.syncOperations.toArray()
    expect(operations.some((operation) => operation.type === 'photo.tag.assign')).toBe(
      true,
    )
  })
})
