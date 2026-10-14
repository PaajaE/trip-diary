import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
const insert = vi.fn()
const eq = vi.fn()
const del = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ delete: del, insert }))
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from, rpc }),
}))

const repo =
  await import('@/entities/public-engagement/api/public-engagement.repository')

const ID = '00000000-0000-4000-8000-000000000001'
const USER = '00000000-0000-4000-8000-0000000000aa'

describe('public engagement repository', () => {
  beforeEach(() => {
    rpc.mockReset()
    insert.mockReset()
    eq.mockReset()
    del.mockClear()
    from.mockClear()
  })

  it('reads the whole tree with one RPC and parses it', async () => {
    rpc.mockResolvedValue({
      data: {
        comments: [
          {
            body: 'Hezké',
            createdAt: '2026-10-14T10:00:00+00:00',
            id: ID,
            name: 'Eva',
            targetId: ID,
            targetType: 'moment',
          },
        ],
        hearts: [{ count: 2, targetId: ID, targetType: 'moment' }],
      },
      error: null,
    })
    const result = await repo.getPublicEngagement('ecerovi', 'kanada')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('get_public_engagement', {
      p_journey_slug: 'kanada',
      p_space_handle: 'ecerovi',
    })
    expect(result?.hearts[0]?.count).toBe(2)
  })

  it('rejects malformed payloads and returns null for a missing journey', async () => {
    rpc.mockResolvedValueOnce({ data: { hearts: 1 }, error: null })
    await expect(repo.getPublicEngagement('a', 'b')).rejects.toThrow()
    rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(repo.getPublicEngagement('a', 'b')).resolves.toBeNull()
  })

  it('never sends id or status when commenting', async () => {
    insert.mockResolvedValue({ error: null })
    await repo.addComment({
      body: 'Ahoj',
      guestName: 'Eva',
      target: { id: ID, type: 'moment' },
      userId: USER,
    })
    expect(from).toHaveBeenCalledWith('content_comments')
    const payload = insert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual([
      'body',
      'guest_name',
      'target_id',
      'target_type',
      'user_id',
    ])
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('status')
  })

  it('omits guest_name for registered users', async () => {
    insert.mockResolvedValue({ error: null })
    await repo.addComment({
      body: 'Ahoj',
      target: { id: ID, type: 'journey' },
      userId: USER,
    })
    expect(insert.mock.calls[0]?.[0]).not.toHaveProperty('guest_name')
  })

  it('maps Postgres errors to typed errors', async () => {
    for (const [code, kind] of [
      ['54000', 'rate_limited'],
      ['23514', 'invalid'],
      ['42501', 'forbidden'],
      ['XX000', 'unknown'],
    ] as const) {
      insert.mockResolvedValueOnce({ error: { code, message: 'x' } })
      await expect(
        repo.addComment({
          body: 'a',
          guestName: 'b',
          target: { id: ID, type: 'moment' },
          userId: USER,
        }),
      ).rejects.toMatchObject({ kind })
    }
  })

  it('reads own hearts through my_hearts and drops v1 target types', async () => {
    rpc.mockResolvedValue({
      data: [
        { target_id: ID, target_type: 'moment' },
        { target_id: ID, target_type: 'photo' },
      ],
      error: null,
    })
    await expect(repo.getMyHearts()).resolves.toEqual([
      { id: ID, type: 'moment' },
    ])
    expect(rpc).toHaveBeenCalledWith('my_hearts', {})
    expect(from).not.toHaveBeenCalled()
  })

  it('removes a heart by target only, never filtering on user_id', async () => {
    const second = vi.fn().mockResolvedValue({ error: null })
    eq.mockReturnValue({ eq: second })
    await repo.removeHeart({ id: ID, type: 'moment' })
    expect(eq).toHaveBeenCalledWith('target_type', 'moment')
    expect(second).toHaveBeenCalledWith('target_id', ID)
    expect(eq).not.toHaveBeenCalledWith('user_id', expect.anything())
  })

  it('treats a duplicate heart as success', async () => {
    insert.mockResolvedValueOnce({ error: { code: '23505', message: 'dup' } })
    await expect(
      repo.addHeart({ id: ID, type: 'media' }, USER),
    ).resolves.toBeUndefined()
    expect(insert).toHaveBeenCalledWith({
      target_id: ID,
      target_type: 'media',
      user_id: USER,
    })
  })

  it('moderates through the RPC and maps errors', async () => {
    rpc.mockResolvedValueOnce({ error: null })
    await repo.moderateComment(ID, 'approved')
    expect(rpc).toHaveBeenCalledWith('moderate_comment', {
      p_comment_id: ID,
      p_status: 'approved',
    })
    rpc.mockResolvedValueOnce({ error: { code: '42501', message: 'no' } })
    await expect(repo.moderateComment(ID, 'rejected')).rejects.toMatchObject({
      kind: 'forbidden',
    })
  })

  it('lists pending comments for a journey', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          body: 'Čeká',
          created_at: '2026-10-14T10:00:00+00:00',
          guest_name: 'Eva',
          id: ID,
          target_id: ID,
          target_type: 'segment',
        },
      ],
      error: null,
    })
    const list = await repo.listPendingComments(USER)
    expect(rpc).toHaveBeenCalledWith('list_pending_comments', {
      p_journey_id: USER,
    })
    expect(list[0]).toMatchObject({
      guestName: 'Eva',
      target: { id: ID, type: 'segment' },
    })
  })
})
