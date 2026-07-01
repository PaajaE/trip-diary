import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9áčďéěíňóřšťúůýž]+/i)
    .filter((token) => token.length >= 3)
}

function scoreGoalMatch(
  item: JourneyChecklistItem,
  hints: { goalId?: string; title?: string },
): number {
  if (hints.goalId === item.id) {
    return 1000
  }

  const title = hints.title?.trim() ?? ''
  if (title === '') {
    return 0
  }

  const haystack = normalizeText(`${item.title} ${item.notes}`)
  const needle = normalizeText(title)
  if (haystack.includes(needle) || needle.includes(normalizeText(item.title))) {
    return 100
  }

  const tokens = tokenize(title)
  if (tokens.length === 0) {
    return 0
  }

  return tokens.reduce((score, token) => {
    return haystack.includes(token) ? score + 10 : score
  }, 0)
}

export function rankGoalsForSpotting(
  items: JourneyChecklistItem[],
  hints: { goalId?: string; title?: string } = {},
): JourneyChecklistItem[] {
  const openGoals = items.filter((item) => item.checkedAt === null)

  return [...openGoals].sort((left, right) => {
    const rightScore = scoreGoalMatch(right, hints)
    const leftScore = scoreGoalMatch(left, hints)
    if (rightScore !== leftScore) {
      return rightScore - leftScore
    }
    return left.position - right.position
  })
}

export function matchObservationToGoal(
  items: JourneyChecklistItem[],
  commonName: string,
): JourneyChecklistItem | null {
  const [best] = rankGoalsForSpotting(items, { title: commonName })
  if (best === undefined) {
    return null
  }
  return scoreGoalMatch(best, { title: commonName }) > 0 ? best : null
}
