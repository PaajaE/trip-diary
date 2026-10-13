import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDraft, saveDraft } from '@/features/quick-note/lib/draft'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('quick note draft', () => {
  it('round-trips per journey and clears on empty text', () => {
    saveDraft('a', 'Medvěd!')
    expect(loadDraft('a')).toBe('Medvěd!')
    expect(loadDraft('b')).toBe('')
    saveDraft('a', '')
    expect(loadDraft('a')).toBe('')
  })

  it('survives unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadDraft('a')).toBe('')
    expect(() => {
      saveDraft('a', 'x')
    }).not.toThrow()
  })
})
