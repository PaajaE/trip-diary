import { describe, expect, it } from 'vitest'
import { findJunkCandidates, type JunkInput } from './junk.ts'

function photo(id: string, over: Partial<JunkInput> = {}): JunkInput {
  return {
    height: 3000,
    id,
    kind: 'photo',
    latitude: 51,
    longitude: -115,
    quality: { exposure: 0.5, sharp: 100, v: 1 },
    starred: false,
    width: 4000,
    ...over,
  }
}

/** 30 ordinary photos so the batch median and percentile are meaningful. */
function batch(extra: JunkInput[]): JunkInput[] {
  const normal = Array.from({ length: 30 }, (_, i) =>
    photo(`n${String(i)}`, {
      quality: { exposure: 0.45, sharp: 80 + i, v: 1 },
    }),
  )
  return [...normal, ...extra]
}

const ids = (items: JunkInput[]): string[] =>
  findJunkCandidates(items).map((c) => c.id)

describe('findJunkCandidates', () => {
  it('flags a flat black frame and a flat blown frame', () => {
    const found = findJunkCandidates(
      batch([
        photo('black', { quality: { exposure: 0.01, sharp: 0.2, v: 1 } }),
        photo('white', { quality: { exposure: 0.99, sharp: 0.5, v: 1 } }),
      ]),
    )
    expect(found).toEqual([
      { id: 'black', reasons: ['blackFrame'] },
      { id: 'white', reasons: ['blownFrame'] },
    ])
  })

  it('keeps a dark night sky with stars (dark but not flat)', () => {
    expect(
      ids(
        batch([
          photo('stars', { quality: { exposure: 0.02, sharp: 40, v: 1 } }),
        ]),
      ),
    ).toEqual([])
  })

  it('flags a dark and very blurry pocket shot', () => {
    const found = findJunkCandidates(
      batch([photo('pocket', { quality: { exposure: 0.1, sharp: 2, v: 1 } })]),
    )
    expect(found).toEqual([{ id: 'pocket', reasons: ['pocketShot'] }])
  })

  it('does not call a blurry but well-lit photo junk', () => {
    expect(
      ids(
        batch([photo('soft', { quality: { exposure: 0.5, sharp: 2, v: 1 } })]),
      ),
    ).toEqual([])
  })

  it('needs a sample for the relative rules, but a blank frame is always flat', () => {
    const small = [
      photo('pocket', { quality: { exposure: 0.1, sharp: 2, v: 1 } }),
      photo('black', { quality: { exposure: 0.01, sharp: 0.1, v: 1 } }),
    ]
    expect(findJunkCandidates(small)).toEqual([
      { id: 'black', reasons: ['blackFrame'] },
    ])
  })

  it('flags tiny pictures without a position, not tiny ones with GPS', () => {
    const found = findJunkCandidates([
      photo('chat', {
        height: 320,
        latitude: null,
        longitude: null,
        width: 480,
      }),
      photo('small-gps', { height: 320, width: 480 }),
    ])
    expect(found).toEqual([{ id: 'chat', reasons: ['tiny'] }])
  })

  it('flags screenshots only when the OS flag is given', () => {
    expect(
      findJunkCandidates([photo('shot', { screenshot: true }), photo('plain')]),
    ).toEqual([{ id: 'shot', reasons: ['screenshot'] }])
  })

  it('never flags videos or starred photos', () => {
    expect(
      findJunkCandidates([
        photo('clip', {
          kind: 'video',
          quality: { exposure: 0.01, sharp: 0, v: 1 },
        }),
        photo('fav', {
          quality: { exposure: 0.01, sharp: 0, v: 1 },
          starred: true,
        }),
      ]),
    ).toEqual([])
  })

  it('is deterministic and independent of the sample order', () => {
    const items = batch([
      photo('black', { quality: { exposure: 0.01, sharp: 0.2, v: 1 } }),
    ])
    expect(findJunkCandidates([...items].reverse())).toEqual(
      findJunkCandidates(items),
    )
  })
})
