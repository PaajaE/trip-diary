export interface PublicSpaceViewModel {
  avatarUrl?: string | null
  bio?: string | null
  handle: string
  journeys: PublicJourneyViewModel[]
  name: string
}

export interface PublicJourneyViewModel {
  coverSrcSet?: string | null
  coverUrl?: string | null
  dateLabel?: string | null
  id: string
  statusLabel: string
  summary?: string | null
  title: string
}
