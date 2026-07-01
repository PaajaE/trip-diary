import { describe, expect, it } from 'vitest'
import { suggestChecklistTemplateFromTitle } from '@/entities/checklist/lib/suggest-template'

describe('suggestChecklistTemplateFromTitle', () => {
  it('suggests Šumava from Czech title', () => {
    expect(suggestChecklistTemplateFromTitle('Výlet do Šumavy')).toBe('sumava')
  })

  it('suggests Krkonoše without diacritics', () => {
    expect(suggestChecklistTemplateFromTitle('Tyden v Krkonosich')).toBe(
      'krkonose',
    )
  })

  it('suggests České Švýcarsko from švýcarsko keyword', () => {
    expect(suggestChecklistTemplateFromTitle('Víkend v Českém Švýcarsku')).toBe(
      'ceske-svycarsko',
    )
  })

  it('returns null for unrelated titles', () => {
    expect(suggestChecklistTemplateFromTitle('Praha na víkend')).toBeNull()
  })
})
