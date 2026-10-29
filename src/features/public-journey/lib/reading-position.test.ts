import { describe, expect, it } from 'vitest'
import {
  loadReadingPosition,
  readingKey,
  saveReadingPosition,
} from './reading-position'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('reading position', () => {
  const key = readingKey('ecer', 'kanada-2026')

  it('round-trips a saved position', () => {
    const storage = memoryStorage()
    saveReadingPosition(storage, key, {
      dayId: 'day-2026-06-11',
      stageId: 's4',
    })
    expect(loadReadingPosition(storage, key)).toEqual({
      dayId: 'day-2026-06-11',
      stageId: 's4',
    })
  })

  it('is separate per journey', () => {
    expect(readingKey('ecer', 'a')).not.toBe(readingKey('ecer', 'b'))
  })

  it.each([
    ['corrupt JSON', '{nope'],
    ['wrong shape', '{"stageId":1}'],
    ['empty ids', '{"dayId":"","stageId":""}'],
  ])('ignores %s', (_name, raw) => {
    expect(loadReadingPosition(memoryStorage({ [key]: raw }), key)).toBeNull()
  })

  it('works without storage', () => {
    expect(loadReadingPosition(null, key)).toBeNull()
    expect(() => {
      saveReadingPosition(null, key, { dayId: 'd', stageId: 's' })
    }).not.toThrow()
  })

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(loadReadingPosition(broken, key)).toBeNull()
    expect(() => {
      saveReadingPosition(broken, key, { dayId: 'd', stageId: 's' })
    }).not.toThrow()
  })
})
