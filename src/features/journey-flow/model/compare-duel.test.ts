import { describe, expect, it } from 'vitest'
import {
  afterKeep,
  afterTrash,
  candidateStatus,
  challengerPosition,
  startDuel,
  stepChallenger,
} from '@/features/journey-flow/model/compare-duel'
import type { PhotoState } from '@/features/journey-flow/model/sort-session'

const order = ['a', 'b', 'c', 'd']
const open = new Map<string, PhotoState>(order.map((id) => [id, 'open']))

describe('compare duel', () => {
  it('starts with the next usable challenger, or the asked one', () => {
    expect(startDuel(order, 'a', open)).toEqual({
      challengerId: 'b',
      winnerId: 'a',
    })
    expect(startDuel(order, 'b', open, 'd').challengerId).toBe('d')
    const trashed = new Map(open).set('d', 'trash')
    expect(startDuel(order, 'b', trashed, 'd').challengerId).toBe('c')
  })

  it('steps through challengers both ways, never the kept or a trashed one', () => {
    const states = new Map(open).set('c', 'trash')
    const duel = { challengerId: 'b', winnerId: 'a' }
    expect(stepChallenger(order, duel, states, 1)).toBe('d')
    expect(stepChallenger(order, duel, states, -1)).toBe('d')
    expect(
      stepChallenger(order, { challengerId: 'd', winnerId: 'a' }, states, 1),
    ).toBe('b')
    expect(
      stepChallenger(['a', 'b'], duel, new Map(open).set('b', 'open'), 1),
    ).toBeNull()
  })

  it('"Nechat tuhle" on the challenger makes it the one that stays', () => {
    const duel = { challengerId: 'b', winnerId: 'a' }
    const states = new Map(open).set('b', 'keep')
    expect(afterKeep(order, duel, states, 'b')).toEqual({
      challengerId: 'c',
      winnerId: 'b',
    })
    expect(afterKeep(order, duel, states, 'a')).toBe(duel)
  })

  it('a trashed winner gives way to the challenger; a trashed challenger to the next', () => {
    const duel = { challengerId: 'b', winnerId: 'a' }
    expect(
      afterTrash(order, duel, new Map(open).set('a', 'trash'), 'a'),
    ).toEqual({ challengerId: 'c', winnerId: 'b' })
    expect(
      afterTrash(order, duel, new Map(open).set('b', 'trash'), 'b'),
    ).toEqual({ challengerId: 'c', winnerId: 'a' })
  })

  it('labels the candidates and counts the position', () => {
    const duel = { challengerId: 'c', winnerId: 'a' }
    const states = new Map(open).set('b', 'trash').set('d', 'keep')
    expect(order.map((id) => candidateStatus(id, duel, states))).toEqual([
      'winner',
      'trash',
      'current',
      'keep',
    ])
    expect(challengerPosition(order, duel)).toEqual({ index: 2, total: 3 })
  })
})
