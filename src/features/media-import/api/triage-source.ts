import type {
  ImportCandidate,
  ImportRange,
  MediaSource,
} from '@/features/media-import/model/types'

/** What the flow knows about access to the photo library. */
export type LibraryAccess =
  | 'authorized'
  | 'denied'
  | 'limited'
  | 'notDetermined'

/** One local preview. `src: null` = no local preview. */
export interface ThumbnailResult {
  /** No preview because the original is only in iCloud (network is off). */
  cloud: boolean
  id: string
  src: string | null
}

export interface PickResult {
  candidates: ImportCandidate[]
  /** Picked items the app cannot read (limited access). */
  left: number
}

/**
 * Where the triage flow gets its items and previews from: PhotoKit on iOS,
 * chosen files in the browser. Metadata only; nothing is uploaded here.
 */
export interface TriageSource {
  getAccess(): Promise<LibraryAccess>
  /** Whole library can be read by date range (iOS). False = pick files only. */
  readonly hasLibrary: boolean
  readonly kind: MediaSource['kind']
  /** Reads candidates in a range (metadata only). Needs `hasLibrary`. */
  list(
    range?: ImportRange,
    onProgress?: (read: number, total: number | null) => void,
  ): Promise<ImportCandidate[]>
  /** Source the upload queue opens originals from. */
  readonly mediaSource: MediaSource
  /** Opens iOS Settings (limited/denied access); absent where meaningless. */
  openSettings?: () => Promise<void>
  /** Opens the picker (file input / PHPicker). Null = cancelled. */
  pick(): Promise<PickResult | null>
  requestAccess(): Promise<LibraryAccess>
  /** Local previews; never downloads from iCloud. */
  thumbnails(ids: readonly string[], size: number): Promise<ThumbnailResult[]>
  /** Allow the upload to download iCloud originals (set by the confirm sheet). */
  setAllowNetwork(allow: boolean): void
}
