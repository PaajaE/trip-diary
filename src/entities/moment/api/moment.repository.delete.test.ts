import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteMomentWithMedia } from '@/entities/moment/api/moment.repository'

let result: { error: unknown } = { error: null }
const rpc = vi.fn(() => Promise.resolve(result))
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ rpc }),
}))

const M = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  result = { error: null }
})

describe('deleteMomentWithMedia', () => {
  it.each(['keep_media', 'trash_media'] as const)(
    'sends mode %s',
    async (mode) => {
      await deleteMomentWithMedia(M, mode)
      expect(rpc).toHaveBeenCalledWith('delete_moment', {
        p_mode: mode,
        p_moment_id: M,
      })
    },
  )

  it('maps SQLSTATE codes', async () => {
    result = { error: { code: '42501', message: 'x' } }
    await expect(deleteMomentWithMedia(M, 'keep_media')).rejects.toMatchObject({
      code: 'forbidden',
    })
    result = { error: { code: 'P0002', message: 'x' } }
    await expect(deleteMomentWithMedia(M, 'keep_media')).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
