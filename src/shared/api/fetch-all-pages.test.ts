import { describe, expect, it } from 'vitest'
import { fetchAllPages, PAGE_SIZE } from '@/shared/api/fetch-all-pages'

function server(total: number) {
  const ranges: [number, number][] = []
  const fetchPage = (from: number, to: number) => {
    ranges.push([from, to])
    const data = Array.from(
      { length: Math.max(0, Math.min(to + 1, total) - from) },
      (_, i) => from + i,
    )
    return Promise.resolve({ data, error: null })
  }
  return { fetchPage, ranges }
}

describe('fetchAllPages', () => {
  it('reads past the 1000 row server cap', async () => {
    const { fetchPage, ranges } = server(2540)
    const result = await fetchAllPages(fetchPage)
    expect(result.data).toHaveLength(2540)
    expect(result.data?.[2539]).toBe(2539)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
  })

  it('stops after a short or empty page', async () => {
    expect((await fetchAllPages(server(5).fetchPage)).data).toHaveLength(5)
    const exact = server(PAGE_SIZE)
    expect((await fetchAllPages(exact.fetchPage)).data).toHaveLength(PAGE_SIZE)
    expect(exact.ranges).toHaveLength(2)
    expect((await fetchAllPages(server(0).fetchPage)).data).toEqual([])
  })

  it('reports an error from any page', async () => {
    const result = await fetchAllPages((from) =>
      Promise.resolve(
        from === 0
          ? { data: new Array<number>(PAGE_SIZE).fill(1), error: null }
          : { data: null, error: { message: 'boom' } },
      ),
    )
    expect(result.error?.message).toBe('boom')
  })
})
