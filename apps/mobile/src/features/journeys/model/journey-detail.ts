import type { JourneyHeader, JourneyStop } from '@trip-diary/core/journey'

export interface JourneyStage {
  id: string
  summary: string
  title: string
}

export interface JourneyEntry {
  body: string
  coverPreviewUrl: string | null
  createdAt: string | null
  eventAt: string | null
  id: string
  slug: string | null
  stageId: string | null
  stopId: string | null
  title: string | null
  type: 'story' | 'tip' | 'note' | 'place'
}

export interface JourneyFullDetail extends JourneyHeader {
  entries: JourneyEntry[]
  spaceId: string
  stages: JourneyStage[]
  stops: JourneyStop[]
}

export interface JourneyContentDetail {
  detail: JourneyFullDetail
  isOffline: boolean
}
