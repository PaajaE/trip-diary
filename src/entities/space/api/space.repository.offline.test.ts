import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listMySpaces } from '@/entities/space/api/space.repository'
import { saveCachedUserSpaces } from '@/entities/space/api/local-space-cache.repository'
import { spaceSummarySchema } from '@/entities/space/model/space'
import { getSupabaseClient } from '@/shared/api/supabase'
import { localDb } from '@/shared/lib/local-db'
import * as network from '@/shared/lib/network'

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('@/shared/lib/network', () => ({
  isBrowserOnline: vi.fn(() => true),
}))

const userId = crypto.randomUUID()
const cachedSpaces = [
  spaceSummarySchema.parse({
    avatarUrl: null,
    description: null,
    handle: 'family',
    id: crypto.randomUUID(),
    kind: 'family',
    name: 'Family space',
    role: 'owner',
  }),
]

describe('listMySpaces offline cache', () => {
  beforeEach(() => {
    vi.mocked(getSupabaseClient).mockReset()
    vi.mocked(network.isBrowserOnline).mockReturnValue(false)
  })

  afterEach(async () => {
    await localDb.cachedUserSpaces.clear()
  })

  it('returns cached spaces when offline', async () => {
    await saveCachedUserSpaces(userId, cachedSpaces)

    await expect(listMySpaces(userId)).resolves.toEqual(cachedSpaces)
    expect(getSupabaseClient).not.toHaveBeenCalled()
  })
})
