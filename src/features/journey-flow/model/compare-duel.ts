/**
 * Porovnání as a duel (M-Porovnani, W-Serie): the kept photo ("ponechaná")
 * stays, challengers come one by one. "Nechat tuhle" on the challenger makes
 * it the new kept one; a trashed photo never comes back as a challenger.
 * Pure: the caller owns the photo states (written or only selected).
 */
import type { PhotoState } from '@/features/journey-flow/model/sort-session'

export interface Duel {
  challengerId: string | null
  winnerId: string
}

export type CandidateStatus =
  | 'current'
  | 'keep'
  | 'trash'
  | 'waiting'
  | 'winner'

type States = ReadonlyMap<string, PhotoState>

const usable = (id: string, duel: Duel, states: States) =>
  id !== duel.winnerId && states.get(id) !== 'trash'

/**
 * The next challenger after `fromId` in `order` (wrapping), skipping the
 * kept photo and trashed ones. Null when there is none other.
 */
export function stepChallenger(
  order: readonly string[],
  duel: Duel,
  states: States,
  delta: 1 | -1,
  fromId: string | null = duel.challengerId,
): string | null {
  const n = order.length
  if (n === 0) return null
  const start = fromId === null ? (delta === 1 ? -1 : 0) : order.indexOf(fromId)
  for (let step = 1; step <= n; step += 1) {
    const id = order[(((start + delta * step) % n) + n) % n]
    if (id !== undefined && id !== fromId && usable(id, duel, states)) return id
  }
  return null
}

/** A duel to start with: `winnerId` against the given or the first usable one. */
export function startDuel(
  order: readonly string[],
  winnerId: string,
  states: States,
  challengerId: string | null = null,
): Duel {
  const base: Duel = { challengerId: null, winnerId }
  if (challengerId !== null && usable(challengerId, base, states)) {
    return { challengerId, winnerId }
  }
  return {
    challengerId: stepChallenger(order, base, states, 1, winnerId),
    winnerId,
  }
}

/** After "Nechat tuhle" on `id` (states already updated). */
export function afterKeep(
  order: readonly string[],
  duel: Duel,
  states: States,
  id: string,
): Duel {
  if (id === duel.winnerId) return duel
  // The kept challenger becomes the one that stays; the next one comes.
  const next: Duel = { challengerId: null, winnerId: id }
  return {
    challengerId: stepChallenger(order, next, states, 1, id),
    winnerId: id,
  }
}

/** After trashing `id` (states already updated). */
export function afterTrash(
  order: readonly string[],
  duel: Duel,
  states: States,
  id: string,
): Duel {
  if (id === duel.winnerId) {
    // The challenger now stays; a new challenger comes.
    const winner = duel.challengerId
    if (winner === null) return duel
    const next: Duel = { challengerId: null, winnerId: winner }
    return {
      challengerId: stepChallenger(order, next, states, 1, winner),
      winnerId: winner,
    }
  }
  return {
    challengerId: stepChallenger(order, duel, states, 1, id),
    winnerId: duel.winnerId,
  }
}

/** Status of each candidate for the strip ("Vyzyvatel 1, do koše"). */
export function candidateStatus(
  id: string,
  duel: Duel,
  states: States,
): CandidateStatus {
  if (id === duel.winnerId) return 'winner'
  if (id === duel.challengerId) return 'current'
  const state = states.get(id)
  if (state === 'trash') return 'trash'
  if (state === 'keep') return 'keep'
  return 'waiting'
}

/** "vyzyvatel 2 z 6": position of the challenger among the others. */
export function challengerPosition(
  order: readonly string[],
  duel: Duel,
): { index: number; total: number } {
  const others = order.filter((id) => id !== duel.winnerId)
  const at = duel.challengerId === null ? -1 : others.indexOf(duel.challengerId)
  return { index: at + 1, total: others.length }
}
