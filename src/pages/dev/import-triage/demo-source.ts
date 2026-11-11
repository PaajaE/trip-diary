import type {
  LibraryAccess,
  ThumbnailResult,
  TriageSource,
} from '@/features/media-import/api/triage-source'
import type { ImportCandidate } from '@/features/media-import/model/types'
import {
  demoCandidates,
  hueOf,
  isDemoCloud,
  placeholderSvg,
  variantOf,
} from '@/pages/dev/import-triage/demo-data'

export interface DemoSourceOptions {
  access: LibraryAccess
  extraCloud?: ReadonlySet<string>
  /** list() never resolves and reports this progress (the reading screen). */
  hold?: { read: number; total: number }
  listFails?: boolean
  total: number
}

/** A fake photo library for the dev harness and tests. */
export function createDemoTriageSource(
  options: DemoSourceOptions,
): TriageSource {
  const all = demoCandidates({ total: options.total })
  const mediaSource = {
    kind: 'photokit' as const,
    list: () => Promise.resolve(all),
    open: () => Promise.reject(new Error('demo source has no originals')),
  }
  return {
    getAccess: () => Promise.resolve(options.access),
    hasLibrary: true,
    kind: 'photokit',
    list(range, onProgress): Promise<ImportCandidate[]> {
      if (options.listFails === true) return Promise.reject(new Error('boom'))
      if (options.hold !== undefined) {
        onProgress?.(options.hold.read, options.hold.total)
        return new Promise(() => undefined)
      }
      const from =
        range?.from === undefined ? -Infinity : Date.parse(range.from)
      const to = range?.to === undefined ? Infinity : Date.parse(range.to)
      return Promise.resolve(
        all.filter((c) => {
          if (c.capturedAt === null) return false
          const at = Date.parse(c.capturedAt)
          return at >= from && at < to
        }),
      )
    },
    mediaSource,
    openSettings: () => Promise.resolve(),
    pick: () => Promise.resolve({ candidates: all, left: 0 }),
    requestAccess: () => Promise.resolve(options.access),
    setAllowNetwork: () => undefined,
    thumbnails(ids): Promise<ThumbnailResult[]> {
      return Promise.resolve(
        ids.map((id) =>
          isDemoCloud(id) || options.extraCloud?.has(id) === true
            ? { cloud: true, id, src: null }
            : {
                cloud: false,
                id,
                src: placeholderSvg(hueOf(id), variantOf(id)),
              },
        ),
      )
    },
  }
}
