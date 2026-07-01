import { describe, expect, it } from 'vitest'
import {
  CHECKLIST_TEMPLATES,
  getChecklistTemplate,
  listAppliedTemplateSlugs,
} from '@/entities/checklist/data/templates'

describe('checklist templates', () => {
  it('includes curated Czech destination templates', () => {
    expect(CHECKLIST_TEMPLATES.map((template) => template.slug)).toEqual([
      'ceske-svycarsko',
      'krkonose',
      'sumava',
    ])
  })

  it('resolves a template by slug', () => {
    const template = getChecklistTemplate('sumava')
    expect(template?.items.length).toBeGreaterThan(0)
    expect(
      template?.items.some((item) => item.createPlannedStop === true),
    ).toBe(true)
  })

  it('lists applied template slugs without duplicates', () => {
    expect(
      listAppliedTemplateSlugs([
        { templateSlug: 'sumava' },
        { templateSlug: 'sumava' },
        { templateSlug: 'krkonose' },
      ]),
    ).toEqual(['sumava', 'krkonose'])
  })
})
