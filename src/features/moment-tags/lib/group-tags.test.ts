import { describe, expect, it } from 'vitest'
import {
  groupTagsByMoment,
  withoutTagging,
  withTagging,
} from '@/features/moment-tags/lib/group-tags'
import type { Tag } from '@/entities/tag/model/tag'

const tag = (id: string, kind: Tag['kind'], label: string): Tag => ({
  gbifTaxonId: kind === 'species' ? 1 : null,
  id,
  kind,
  label,
  slug: id,
})
const fauna = tag('fauna', 'category', 'Fauna')
const bear = tag('bear', 'species', 'Medvěd')
const rain = tag('rain', 'free', 'Déšť')
const data = {
  taggings: [
    { momentId: 'm1', tagId: 'bear' },
    { momentId: 'm1', tagId: 'rain' },
    { momentId: 'm1', tagId: 'fauna' },
    { momentId: 'm2', tagId: 'ghost' },
  ],
  tags: [bear, rain, fauna],
}

describe('groupTagsByMoment', () => {
  it('orders categories, free tags, species and skips unknown tags', () => {
    const map = groupTagsByMoment(data)
    expect(map.get('m1')?.map((t) => t.id)).toEqual(['fauna', 'rain', 'bear'])
    expect(map.has('m2')).toBe(false)
  })

  it('handles missing data', () => {
    expect(groupTagsByMoment(undefined).size).toBe(0)
  })
})

describe('cache helpers', () => {
  it('adds a tagging once and the tag row when unknown', () => {
    const extra = tag('new', 'free', 'Nový')
    const next = withTagging(data, 'm2', extra)
    expect(next.taggings).toContainEqual({ momentId: 'm2', tagId: 'new' })
    expect(next.tags).toContain(extra)
    expect(withTagging(next, 'm2', extra)).toBe(next)
  })

  it('removes only the given tagging', () => {
    const next = withoutTagging(data, 'm1', 'rain')
    expect(next.taggings).toHaveLength(3)
    expect(next.taggings).not.toContainEqual({ momentId: 'm1', tagId: 'rain' })
  })
})
