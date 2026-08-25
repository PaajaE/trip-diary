import type { JourneyStageContent } from '@/features/journeys/lib/journey-content'

export const INITIAL_VISIBLE_MOMENTS = 8

export function countStageMoments(
  stageContents: JourneyStageContent[],
): number {
  return stageContents.reduce((sum, stage) => sum + stage.moments.length, 0)
}

export function limitStageMoments(
  stageContents: JourneyStageContent[],
  limit: number,
): {
  hiddenCount: number
  stages: JourneyStageContent[]
  total: number
} {
  const total = countStageMoments(stageContents)
  if (limit >= total) {
    return { hiddenCount: 0, stages: stageContents, total }
  }

  let remaining = Math.max(0, limit)
  const stages: JourneyStageContent[] = []

  for (const stage of stageContents) {
    if (remaining <= 0) {
      break
    }
    const moments = stage.moments.slice(0, remaining)
    remaining -= moments.length
    if (moments.length > 0) {
      stages.push({ ...stage, moments })
    }
  }

  return { hiddenCount: total - limit, stages, total }
}
