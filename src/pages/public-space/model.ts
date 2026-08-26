export interface PublicSpaceViewModel {
  avatarUrl?: string | null
  bio?: string | null
  diaryEntries: PublicEntryViewModel[]
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

export interface PublicEntryViewModel {
  dateLabel: string
  excerpt?: string | null
  id: string
  imageUrl?: string | null
  journeySlug?: string | null
  title: string
  typeLabel: string
}
