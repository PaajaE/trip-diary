import {
  getMediaLibraryStatus,
  getMediaLibraryThumbnails,
  pickMediaLibraryAssets,
  requestMediaLibraryAccess,
  type MediaLibraryStatus,
} from '@/shared/lib/media-library'
import {
  assetsToCandidates,
  createPhotoKitSource,
} from '@/features/media-import/api/photokit-source'
import type {
  LibraryAccess,
  PickResult,
  ThumbnailResult,
  TriageSource,
} from '@/features/media-import/api/triage-source'
import type {
  ImportCandidate,
  ImportRange,
} from '@/features/media-import/model/types'

export function toLibraryAccess(status: MediaLibraryStatus): LibraryAccess {
  if (status === 'authorized' || status === 'limited') return status
  if (status === 'notDetermined') return 'notDetermined'
  return 'denied'
}

/** iOS: PhotoKit metadata and local thumbnails (native path UNVERIFIED). */
export function createPhotoKitTriageSource(): TriageSource {
  let allowNetwork = false
  // The upload queue opens originals through a source created lazily so the
  // iCloud switch (set at confirm time) is honoured.
  const lazySource = {
    kind: 'photokit' as const,
    list: (range?: ImportRange) =>
      createPhotoKitSource({ allowNetwork }).list(range),
    open: (candidate: ImportCandidate) =>
      createPhotoKitSource({ allowNetwork }).open(candidate),
  }
  return {
    async getAccess() {
      return toLibraryAccess(await getMediaLibraryStatus())
    },
    hasLibrary: true,
    kind: 'photokit',
    list: (range) => lazySource.list(range),
    mediaSource: lazySource,
    openSettings() {
      // @capacitor/app has no openSettings; iOS opens the app's Settings page
      // for this URL scheme when the WebView navigates to it (UNVERIFIED).
      window.location.assign('app-settings:')
      return Promise.resolve()
    },
    async pick(): Promise<PickResult | null> {
      const result = await pickMediaLibraryAssets()
      if (result.cancelled) return null
      return {
        candidates: assetsToCandidates(result.assets),
        left: Math.max(0, result.requested - result.resolved),
      }
    },
    async requestAccess() {
      return toLibraryAccess(await requestMediaLibraryAccess())
    },
    setAllowNetwork(allow) {
      allowNetwork = allow
    },
    async thumbnails(ids, size): Promise<ThumbnailResult[]> {
      const results = await getMediaLibraryThumbnails(ids, {
        allowNetwork: false,
        size,
      })
      return results.map((item) => ({
        cloud: item.unavailable,
        id: item.id,
        src: item.unavailable ? null : item.src,
      }))
    },
  }
}
