import type { PlaceKind } from '@trip-diary/core/automation'

/** The stored place facts the client has today (no stored kind yet). */
export interface PlaceFacts {
  /** Stored kind (places.kind); null/absent for old rows. */
  kind?: PlaceKind | null | undefined
  name: string
  region: string | null
}

export interface DerivedPlace {
  kind: PlaceKind | undefined
  name: string
}

const NEAR_PREFIX = 'u '

/** Words that make an English/local name a natural feature (temporary heuristic). */
const NATURAL_WORDS =
  /\b(mount|mountain|mt|peak|ridge|lake|glacier|falls|canyon|creek|pass|trail|valley|summit|point|hill|river|icefield|towers|dome|beach|cliffs?|spring|springs|rapids|bay)\b/i

const ATTRACTION_WORDS = /\b(viewpoint|outlook|skywalk|visitor|museum)\b/i

/**
 * The ONE place that decides the kind of a place from what the client has.
 * The stored kind (places.kind) wins; the heuristics below only serve old rows
 * without a kind.
 *   - "u X" is the "near X" label of the geocoder: kind `near`, name `X`;
 *   - a name equal to its region is the region fallback;
 *   - names of natural features are `natural`;
 *   - everything else is unknown (`undefined`).
 */
export function derivePlace(facts: PlaceFacts): DerivedPlace {
  const raw = facts.name.trim()
  if (facts.kind !== null && facts.kind !== undefined) {
    return {
      kind: facts.kind,
      name: raw.startsWith(NEAR_PREFIX)
        ? raw.slice(NEAR_PREFIX.length).trim()
        : raw,
    }
  }
  if (raw.startsWith(NEAR_PREFIX)) {
    return { kind: 'near', name: raw.slice(NEAR_PREFIX.length).trim() }
  }
  if (facts.region !== null && raw === facts.region.trim()) {
    return { kind: 'region', name: raw }
  }
  if (ATTRACTION_WORDS.test(raw)) return { kind: 'attraction', name: raw }
  if (NATURAL_WORDS.test(raw)) return { kind: 'natural', name: raw }
  return { kind: undefined, name: raw }
}
