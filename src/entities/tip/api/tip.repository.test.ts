import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTip,
  deleteTip,
  listSpaceTips,
  tipSlug,
  updateTip,
} from '@/entities/tip/api/tip.repository'

const ID = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'
const S = '33333333-3333-4333-8333-333333333333'
const row = {
  author_id: U,
  body: 'b',
  created_at: '2026-01-01T10:00:00+00:00',
  id: ID,
  journey_id: null,
  kind: 'tip',
  place_id: null,
  published_at: null,
  segment_id: null,
  slug: 'x-111111',
  space_id: S,
  title: 'T',
  updated_at: '2026-01-01T10:00:00+00:00',
  visibility: 'private',
}

let results: { data: unknown; error: unknown }[] = []
const calls: string[] = []
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of [
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'order',
  'single',
  'maybeSingle',
]) {
  chain[name] = vi.fn((...args: unknown[]) => {
    calls.push(`${name}:${JSON.stringify(args)}`)
    return Object.assign(
      {
        then: (
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown,
        ) =>
          Promise.resolve(results.shift() ?? { data: null, error: null }).then(
            resolve,
            reject,
          ),
      },
      chain,
    )
  })
}
const from = vi.fn(() => chain)
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ from }),
}))

beforeEach(() => {
  results = []
  calls.length = 0
  vi.clearAllMocks()
})

describe('tip repository', () => {
  it('lists tips of the author in the space', async () => {
    results = [{ data: [row], error: null }]
    const tips = await listSpaceTips(S, U)
    expect(tips[0]).toMatchObject({ title: 'T', visibility: 'private' })
    expect(calls).toContain(`eq:${JSON.stringify(['kind', 'tip'])}`)
    expect(calls).toContain(`eq:${JSON.stringify(['author_id', U])}`)
  })

  it('rejects malformed rows', async () => {
    results = [{ data: [{ ...row, visibility: 'weird' }], error: null }]
    await expect(listSpaceTips(S, U)).rejects.toMatchObject({
      code: 'invalid_row',
    })
  })

  it('creates with granted columns and a slug; private has no published_at', async () => {
    results = [{ data: row, error: null }]
    await createTip({
      authorId: U,
      id: ID,
      input: { body: ' b ', title: 'Dobré jídlo', visibility: 'private' },
      spaceId: S,
    })
    const inserted = chain.insert?.mock.calls[0]?.[0] as Record<string, unknown>
    expect(inserted).toMatchObject({
      body: 'b',
      kind: 'tip',
      published_at: null,
      slug: 'dobre-jidlo-111111',
      space_id: S,
      visibility: 'private',
    })
  })

  it('sets published_at when publishing and keeps the first value', async () => {
    results = [{ data: { ...row, visibility: 'public' }, error: null }]
    await createTip({
      authorId: U,
      input: { body: '', title: 'A', visibility: 'public' },
      spaceId: S,
    })
    const inserted = chain.insert?.mock.calls[0]?.[0] as {
      published_at: string
    }
    expect(Date.parse(inserted.published_at)).not.toBeNaN()

    const tip = {
      authorId: U,
      body: '',
      createdAt: row.created_at,
      id: ID,
      journeyId: null,
      publishedAt: '2026-02-02T00:00:00+00:00',
      slug: 's',
      spaceId: S,
      title: 'A',
      updatedAt: row.updated_at,
      visibility: 'public' as const,
    }
    results = [
      {
        data: { ...row, published_at: tip.publishedAt, visibility: 'public' },
        error: null,
      },
    ]
    await updateTip(tip, { body: '', title: 'A', visibility: 'public' })
    expect(chain.update?.mock.calls[0]?.[0]).toMatchObject({
      published_at: tip.publishedAt,
    })
    results = [{ data: row, error: null }]
    await updateTip(tip, { body: '', title: 'A', visibility: 'private' })
    expect(chain.update?.mock.calls[1]?.[0]).toMatchObject({
      published_at: null,
    })
  })

  it('validates before touching the database', async () => {
    await expect(
      createTip({
        authorId: U,
        input: { body: '', title: ' ', visibility: 'private' },
        spaceId: S,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' })
    expect(from).not.toHaveBeenCalled()
  })

  it('maps RLS, missing and delete errors', async () => {
    results = [{ data: null, error: { code: '42501', message: 'rls' } }]
    await expect(
      createTip({
        authorId: U,
        input: { body: '', title: 'A', visibility: 'private' },
        spaceId: S,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })
    results = [{ data: null, error: null }]
    await expect(
      updateTip({ id: ID, publishedAt: null } as never, {
        body: '',
        title: 'A',
        visibility: 'private',
      }),
    ).rejects.toMatchObject({ code: 'not_found' })
    results = [{ data: null, error: { message: 'x' } }]
    await expect(deleteTip(ID)).rejects.toMatchObject({ code: 'delete_failed' })
  })

  it('builds a stable ASCII slug with an id suffix', () => {
    expect(tipSlug('Čaj & káva!', ID)).toBe('caj-kava-111111')
    expect(tipSlug('🐻', ID)).toMatch(/^[a-z0-9][a-z0-9-]{0,79}$/)
  })
})
