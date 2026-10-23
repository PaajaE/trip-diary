import { resolveThumbUrl } from '@/entities/public-journey/lib/media-url'
import type { JourneyModel } from '@/entities/public-journey/lib/journey-model'
import type {
  PublicMapLine,
  PublicMapPoint,
} from '@/features/public-journey/ui/PublicJourneyMap'

export interface PublicMapData {
  lines: PublicMapLine[]
  points: PublicMapPoint[]
}

/**
 * Map content for the whole journey (`scopeId` null) or one segment.
 * Moments without coordinates (hidden or unknown location) get no pin.
 */
export function buildMapData(
  model: JourneyModel,
  scopeId: string | null,
): PublicMapData {
  const moments =
    scopeId === null ? model.moments : model.momentsInSpan(scopeId)
  const points: PublicMapPoint[] = []
  const coordsByStage = new Map<string, number[][]>()
  for (const moment of moments) {
    if (moment.latitude === null || moment.longitude === null) continue
    const segment = model.segmentOfInstant(moment.startsAt)
    const owner = segment?.id ?? scopeId ?? ''
    const media = model.mediaByMoment.get(moment.id) ?? []
    const cover =
      (moment.coverMediaId === null
        ? undefined
        : model.mediaById.get(moment.coverMediaId)) ?? media[0]
    const stageOfMoment = model.stageOf(owner)
    points.push({
      color: model.stageColor(owner),
      dayKey: model.dayKeyOf(moment.startsAt, stageOfMoment),
      id: moment.id,
      label: moment.title ?? '',
      latitude: moment.latitude,
      longitude: moment.longitude,
      stageId: stageOfMoment?.id ?? '',
      stageIndex: model.stages.findIndex((st) => st.id === stageOfMoment?.id),
      thumbUrl: cover === undefined ? null : resolveThumbUrl(cover),
    })
    const stageId = model.stageOf(owner)?.id ?? ''
    const list = coordsByStage.get(stageId) ?? []
    list.push([moment.longitude, moment.latitude])
    coordsByStage.set(stageId, list)
  }

  const inScope = (segmentId: string): boolean => {
    if (scopeId === null) return true
    if (segmentId === scopeId) return true
    const seg = model.segmentById.get(segmentId)
    const scope = model.segmentById.get(scopeId)
    return (
      seg !== undefined &&
      scope !== undefined &&
      Date.parse(scope.startsAt) <= Date.parse(seg.startsAt) &&
      Date.parse(seg.endsAt) <= Date.parse(scope.endsAt)
    )
  }

  const lines: PublicMapLine[] = []
  const stagesWithTracks = new Set<string>()
  for (const track of model.data.tracks) {
    if (!inScope(track.segmentId)) continue
    lines.push({
      color: model.stageColor(track.segmentId),
      coordinates: track.geojson.coordinates,
      id: track.id,
      stageId: model.stageOf(track.segmentId)?.id ?? '',
    })
    const stage = model.stageOf(track.segmentId)
    if (stage !== null) stagesWithTracks.add(stage.id)
  }
  // Stages without a recorded track: dashed connector through the moments.
  for (const [stageId, coords] of coordsByStage) {
    if (stagesWithTracks.has(stageId) || coords.length < 2) continue
    lines.push({
      color: model.stageColor(stageId),
      coordinates: coords,
      dashed: true,
      id: `route-${stageId}`,
      stageId,
    })
  }
  return { lines, points }
}
