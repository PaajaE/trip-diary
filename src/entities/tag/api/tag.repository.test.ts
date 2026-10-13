import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addMomentTag,
  findOrCreateTag,
  listMomentTaggings,
  removeMomentTag,
} from '@/entities/tag/api/tag.repository'

const ID = '11111111-1111-4111-8111-111111111111'
const U = '22222222-2222-4222-8222-222222222222'
const row = {
  gbif_taxon_id: null,
  id: ID,
  kind: 'free',
  label: 'Déšť',
  slug: 'dest',
}

let results: { data: unknown; error: unknown }[] = []
const calls: string[] = []
const chain: Record<string, ReturnType<typeof vi.fn>> = {}
for (const name of [
  'select',
  'insert',
  'delete',
  'eq',
  'in',
  'maybeSingle',
  'single',
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

describe('tag repository', () => {
  it('returns an existing tag without inserting', async () => {
    results = [{ data: row, error: null }]
    const tag = await findOrCreateTag({
      createdBy: U,
      kind: 'free',
      label: 'Déšť',
      slug: 'dest',
    })
    expect(tag.id).toBe(ID)
    expect(chain.insert).not.toHaveBeenCalled()
  })

  it('creates a missing tag', async () => {
    results = [
      { data: null, error: null },
      { data: row, error: null },
    ]
    const tag = await findOrCreateTag({
      createdBy: U,
      kind: 'free',
      label: 'Déšť',
      slug: 'dest',
    })
    expect(tag.slug).toBe('dest')
    expect(chain.insert).toHaveBeenCalledWith({
      created_by: U,
      gbif_taxon_id: null,
      kind: 'free',
      label: 'Déšť',
      slug: 'dest',
    })
  })

  it('reads the winner when a concurrent insert violates uniqueness', async () => {
    results = [
      { data: null, error: null },
      { data: null, error: { code: '23505', message: 'dup' } },
      { data: row, error: null },
    ]
    const tag = await findOrCreateTag({
      createdBy: U,
      kind: 'free',
      label: 'Déšť',
      slug: 'dest',
    })
    expect(tag.id).toBe(ID)
  })

  it('treats an existing tagging as success and maps RLS errors', async () => {
    results = [{ data: null, error: { code: '23505', message: 'dup' } }]
    await expect(addMomentTag(ID, ID, U)).resolves.toBeUndefined()
    results = [{ data: null, error: { code: '42501', message: 'rls' } }]
    await expect(addMomentTag(ID, ID, U)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })

  it('removes by tag, target type and target', async () => {
    results = [{ data: null, error: null }]
    await removeMomentTag(ID, U)
    expect(calls).toContain(`eq:${JSON.stringify(['target_type', 'moment'])}`)
    results = [{ data: null, error: { message: 'x' } }]
    await expect(removeMomentTag(ID, U)).rejects.toMatchObject({
      code: 'delete_failed',
    })
  })

  it('lists taggings in chunks of 100 ids', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${String(i)}`)
    results = [
      { data: [{ tag_id: 't', target_id: 'id-0' }], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]
    const out = await listMomentTaggings(ids)
    expect(out).toEqual([{ momentId: 'id-0', tagId: 't' }])
    expect(calls.filter((c) => c.startsWith('in:'))).toHaveLength(3)
  })
})
