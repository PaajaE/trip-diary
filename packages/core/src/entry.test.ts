import { describe, expect, it } from 'vitest'
import { entrySchema } from './entry.ts'

describe('entrySchema', () => {
  it('accepts PostgreSQL timestamps with an explicit offset', () => {
    const result = entrySchema.safeParse({
      body: '',
      createdAt: '2026-06-09T20:35:57.569114+00:00',
      creatorId: crypto.randomUUID(),
      eventAt: '2026-06-09T20:35:57.184+00:00',
      id: crypto.randomUUID(),
      language: 'cs',
      publishedAt: '2026-06-09T20:35:57.569114+00:00',
      status: 'published',
      syncStatus: 'synced',
      title: 'Road',
      type: 'story',
      updatedAt: '2026-06-09T20:35:57.569114+00:00',
      version: 1,
      visibility: 'public',
    })

    expect(result.success).toBe(true)
  })
})
