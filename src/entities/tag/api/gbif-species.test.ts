import { afterEach, describe, expect, it, vi } from 'vitest'
import { speciesLabel, suggestSpecies } from '@/entities/tag/api/gbif-species'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => {
  fetchMock.mockReset()
})

const ok = (body: unknown) =>
  Promise.resolve({ json: () => Promise.resolve(body), ok: true, status: 200 })

describe('suggestSpecies', () => {
  it('does not call GBIF for short queries', async () => {
    expect(await suggestSpecies('ur', 'cs')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps results, dedupes keys and prefers the canonical name', async () => {
    fetchMock.mockReturnValue(
      ok([
        {
          canonicalName: 'Ursus arctos',
          key: 2433406,
          scientificName: 'Ursus arctos Linnaeus, 1758',
          vernacularName: 'Medvěd hnědý',
        },
        { key: 2433406, scientificName: 'Ursus arctos dup' },
        { key: 5, scientificName: 'Foo bar' },
      ]),
    )
    const result = await suggestSpecies('  ursus ', 'cs')
    expect(result).toEqual([
      {
        scientificName: 'Ursus arctos',
        taxonKey: 2433406,
        vernacularName: 'Medvěd hnědý',
      },
      { scientificName: 'Foo bar', taxonKey: 5, vernacularName: null },
    ])
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.searchParams.get('q')).toBe('ursus')
    expect(url.searchParams.get('rank')).toBe('SPECIES')
    expect(url.searchParams.get('language')).toBe('cs')
  })

  it('throws on HTTP errors and on unexpected payloads', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve({ ok: false, status: 503 }))
    await expect(suggestSpecies('ursus', 'en')).rejects.toThrow('503')
    fetchMock.mockReturnValueOnce(ok({ nope: true }))
    await expect(suggestSpecies('ursus', 'en')).rejects.toThrow()
  })

  it('labels with the common name, else the Latin one', () => {
    expect(
      speciesLabel({
        scientificName: 'A b',
        taxonKey: 1,
        vernacularName: 'Lišák',
      }),
    ).toBe('Lišák')
    expect(
      speciesLabel({
        scientificName: 'A b',
        taxonKey: 1,
        vernacularName: null,
      }),
    ).toBe('A b')
  })
})
