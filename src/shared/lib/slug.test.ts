import { describe, expect, it } from 'vitest'
import { createPublicSlug } from '@/shared/lib/slug'

describe('createPublicSlug', () => {
  it('creates readable deterministic collision-resistant slugs', () => {
    expect(
      createPublicSlug(
        'Český Krumlov & okolí',
        '12345678-0000-4000-8000-000000000000',
      ),
    ).toBe('cesky-krumlov-okoli-12345678')
  })
})
