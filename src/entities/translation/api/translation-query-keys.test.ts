import { describe, expect, it } from 'vitest'
import { translationQueryKeys } from '@/entities/translation/api/translation-query-keys'

describe('translationQueryKeys', () => {
  it('builds stable detail keys scoped by entry and locale', () => {
    expect(translationQueryKeys.detail('entry-a', 'en')).toEqual([
      'entry-translations',
      'entry-a',
      'en',
    ])
    expect(translationQueryKeys.detail('entry-b', 'en')).toEqual([
      'entry-translations',
      'entry-b',
      'en',
    ])
  })

  it('isolates locales for the same entry', () => {
    expect(translationQueryKeys.detail('entry-a', 'en')).not.toEqual(
      translationQueryKeys.detail('entry-a', 'cs'),
    )
  })

  it('groups all locales for an entry under byEntry', () => {
    expect(translationQueryKeys.byEntry('entry-a')).toEqual([
      'entry-translations',
      'entry-a',
    ])
  })
})
