export interface PublicSpaceViewModel {
  avatarUrl?: string | null
  bio?: string | null
  handle: string
  journeys: PublicJourneyViewModel[]
  name: string
  standaloneEntries: PublicEntryViewModel[]
}

export interface PublicJourneyViewModel {
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
  title: string
  typeLabel: string
}
