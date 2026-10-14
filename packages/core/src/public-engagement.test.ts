import { describe, expect, it } from 'vitest'
import { parsePublicEngagement } from './public-engagement.ts'

const id = '11111111-1111-4111-8111-111111111111'

describe('parsePublicEngagement', () => {
  it('returns null for a missing or private journey', () => {
    expect(parsePublicEngagement(null)).toBeNull()
  })

  it('parses hearts and approved comments', () => {
    const parsed = parsePublicEngagement({
      comments: [
        {
          body: 'Krasa!',
          createdAt: '2026-10-14T10:00:00.123456+00:00',
          id,
          name: 'Jana',
          targetId: id,
          targetType: 'moment',
        },
      ],
      hearts: [{ count: 3, targetId: id, targetType: 'media' }],
    })
    expect(parsed?.hearts[0]?.count).toBe(3)
    expect(parsed?.comments[0]?.name).toBe('Jana')
  })

  it('accepts empty lists', () => {
    expect(parsePublicEngagement({ comments: [], hearts: [] })).toEqual({
      comments: [],
      hearts: [],
    })
  })

  it('rejects legacy target types and malformed items', () => {
    expect(() =>
      parsePublicEngagement({ comments: [], hearts: [{ count: 1, targetId: id, targetType: 'photo' }] }),
    ).toThrow()
    expect(() => parsePublicEngagement({ hearts: [] })).toThrow()
  })
})
