/**
 * Depth of the hierarchy shown for a journey (plan 4f, "UX: hloubka podle
 * velikosti cesty"). Derived, never stored. An empty level is not shown:
 *   - one-day journey:          stops only;
 *   - weekend / week holiday:   days -> stops;
 *   - longer trip (2-6 weeks):  days -> stops, stages offered as a suggestion;
 *   - grand journey (months):   stages -> days -> stops.
 * The stage level exists only with >= 2 stages that each have a clear
 * reason; otherwise there is no stage level at all.
 */

export type JourneySize = 'day' | 'grand' | 'long' | 'short'
export type HierarchyLevel = 'days' | 'stages' | 'stops'
/** How stages are shown: not at all, as an offer next to days, or as the top level. */
export type StageMode = 'none' | 'primary' | 'suggestion'

export interface DepthStage {
  endsAt: string
  kind: 'stage' | 'trip'
  origin: 'accepted' | 'manual' | 'rejected' | 'suggested'
  /**
   * Why the planner proposed it (PlannedSegment.reason). Undefined when the
   * caller does not know (stored segments carry no reason); an explicit empty
   * string or null means "no clear reason".
   */
  reason?: string | null | undefined
  startsAt: string
}

export interface HierarchyDepthInput {
  /** Local days (04:00 rule) the journey has photos on, any order. */
  dayKeys: readonly string[]
  stages: readonly DepthStage[]
}

export interface HierarchyDepthOptions {
  /** Longest "weekend / week holiday" span in days (inclusive). Default 13. */
  maxShortDays?: number
  /** Longest "2-6 weeks" span in days (inclusive). Default 42. */
  maxLongDays?: number
  /** A suggested stage shorter than this is no clear stage. Default 2 days. */
  minStageMs?: number
}

export interface HierarchyDepth {
  /** Levels to show, top first. */
  levels: HierarchyLevel[]
  size: JourneySize
  /** Calendar days from the first to the last photo day (inclusive). */
  spanDays: number
  /** Stages that count (>= 2 needed for a stage level). */
  stageCount: number
  stageMode: StageMode
}

const DAY_MS = 86_400_000

function dayNumber(dayKey: string): number | null {
  const time = Date.parse(`${dayKey}T00:00:00Z`)
  return Number.isNaN(time) ? null : Math.round(time / DAY_MS)
}

/** A stage with a clear reason: made or accepted by the user, or a long enough proposal with a reason. */
export function isClearStage(
  stage: DepthStage,
  minStageMs: number = 2 * DAY_MS,
): boolean {
  if (stage.kind !== 'stage' || stage.origin === 'rejected') return false
  if (stage.origin === 'manual' || stage.origin === 'accepted') return true
  if (stage.reason !== undefined && (stage.reason ?? '').trim() === '') {
    return false
  }
  const start = Date.parse(stage.startsAt)
  const end = Date.parse(stage.endsAt)
  return !Number.isNaN(start) && !Number.isNaN(end) && end - start >= minStageMs
}

export function hierarchyDepth(
  input: HierarchyDepthInput,
  options: HierarchyDepthOptions = {},
): HierarchyDepth {
  const maxShort = options.maxShortDays ?? 13
  const maxLong = options.maxLongDays ?? 42
  const numbers = input.dayKeys
    .map(dayNumber)
    .filter((value): value is number => value !== null)
  const spanDays =
    numbers.length === 0 ? 0 : Math.max(...numbers) - Math.min(...numbers) + 1
  const stageCount = input.stages.filter((stage) =>
    isClearStage(stage, options.minStageMs),
  ).length
  const hasStages = stageCount >= 2

  if (spanDays <= 1) {
    return {
      levels: ['stops'],
      size: 'day',
      spanDays,
      stageCount,
      stageMode: 'none',
    }
  }
  if (spanDays <= maxShort) {
    return {
      levels: ['days', 'stops'],
      size: 'short',
      spanDays,
      stageCount,
      stageMode: 'none',
    }
  }
  if (spanDays <= maxLong) {
    return {
      levels: ['days', 'stops'],
      size: 'long',
      spanDays,
      stageCount,
      stageMode: hasStages ? 'suggestion' : 'none',
    }
  }
  return hasStages
    ? {
        levels: ['stages', 'days', 'stops'],
        size: 'grand',
        spanDays,
        stageCount,
        stageMode: 'primary',
      }
    : {
        levels: ['days', 'stops'],
        size: 'grand',
        spanDays,
        stageCount,
        stageMode: 'none',
      }
}
