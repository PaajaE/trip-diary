import { Capacitor } from '@capacitor/core'
import {
  deleteMediaLibraryPhotoExports,
  exportMediaLibraryPhoto,
  listMediaLibraryAssets,
  type MediaLibraryAsset,
} from '@/shared/lib/media-library'
import { applyRange } from '@/features/media-import/model/range'
import type {
  ImportCandidate,
  ImportRange,
  MediaSource,
  OpenedPhoto,
} from '@/features/media-import/model/types'

/** Videos longer than this are listed as skipped (`video_too_long`). */
export const MAX_IMPORT_VIDEO_MS = 60_000

export interface PhotoKitSourceDeps {
  allowNetwork: boolean
  deleteExports: (fileUrls: string[]) => Promise<void>
  exportPhoto: typeof exportMediaLibraryPhoto
  /** file:// URL -> bytes. */
  readFile: (fileUrl: string) => Promise<Blob>
  listAssets: () => Promise<MediaLibraryAsset[]>
  maxLongEdge?: number
}

const defaultDeps: PhotoKitSourceDeps = {
  allowNetwork: false,
  deleteExports: deleteMediaLibraryPhotoExports,
  exportPhoto: exportMediaLibraryPhoto,
  listAssets: async () => (await listMediaLibraryAssets()).assets,
  readFile: async (fileUrl) => {
    const response = await fetch(Capacitor.convertFileSrc(fileUrl))
    if (!response.ok) {
      throw new Error(`reading export failed with ${String(response.status)}`)
    }
    return response.blob()
  },
}

function toCandidate(asset: MediaLibraryAsset): ImportCandidate | null {
  if (asset.mediaType !== 'image' && asset.mediaType !== 'video') return null
  const video = asset.mediaType === 'video'
  const durationMs = asset.durationMs ?? null
  return {
    capturedAt: asset.creationDate ?? null,
    durationMs: video ? durationMs : null,
    latitude: asset.latitude ?? null,
    longitude: asset.longitude ?? null,
    mediaType: video ? 'video' : 'photo',
    sourceId: asset.id,
    ...(video && durationMs !== null && durationMs > MAX_IMPORT_VIDEO_MS
      ? { skipReason: 'video_too_long' as const }
      : {}),
  }
}

/** PhotoKit source: lists metadata only; originals are exported on demand. */
export function createPhotoKitSource(
  overrides: Partial<PhotoKitSourceDeps> = {},
): MediaSource {
  const deps: PhotoKitSourceDeps = { ...defaultDeps, ...overrides }
  return {
    kind: 'photokit',
    async list(range?: ImportRange) {
      const assets = await deps.listAssets()
      const candidates: ImportCandidate[] = []
      for (const asset of assets) {
        const candidate = toCandidate(asset)
        if (candidate !== null) candidates.push(candidate)
      }
      return applyRange(candidates, range)
    },
    async open(candidate): Promise<OpenedPhoto> {
      if (candidate.mediaType !== 'photo') {
        throw new Error('videos are uploaded through uploadVideo(assetId)')
      }
      const exported = await deps.exportPhoto({
        allowNetwork: deps.allowNetwork,
        id: candidate.sourceId,
        ...(deps.maxLongEdge === undefined
          ? {}
          : { maxLongEdge: deps.maxLongEdge }),
      })
      try {
        const blob = await deps.readFile(exported.fileUrl)
        const file = new File([blob], 'photo.jpg', { type: exported.mimeType })
        return {
          cleanup: () => deps.deleteExports([exported.fileUrl]),
          file,
        }
      } catch (error) {
        await deps.deleteExports([exported.fileUrl]).catch(() => undefined)
        throw error
      }
    },
  }
}
