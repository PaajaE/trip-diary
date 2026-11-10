import {
  createWebFilesSource,
  WEB_FILES_ACCEPT,
  webSourceId,
} from '@/features/media-import/api/web-files-source'
import type {
  PickResult,
  ThumbnailResult,
  TriageSource,
} from '@/features/media-import/api/triage-source'
import type {
  ImportCandidate,
  MediaSource,
  OpenedPhoto,
} from '@/features/media-import/model/types'

/** Opens the browser file dialog; null when the user cancels. */
export function chooseFiles(): Promise<File[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = WEB_FILES_ACCEPT
    input.addEventListener('change', () => {
      resolve(Array.from(input.files ?? []))
    })
    input.addEventListener('cancel', () => {
      resolve(null)
    })
    input.click()
  })
}

export interface FilesTriageSource extends TriageSource {
  /** Registers dropped files and returns their candidates. */
  addFiles(files: readonly File[]): Promise<ImportCandidate[]>
}

/** Browser: files chosen or dropped; previews are object URLs of the files. */
export function createFilesTriageSource(
  choose: () => Promise<File[] | null> = chooseFiles,
): FilesTriageSource {
  const files = new Map<string, File>()
  const urls = new Map<string, string>()
  const mediaSource: MediaSource = {
    kind: 'web-files',
    list: () => Promise.resolve([]),
    open(candidate): Promise<OpenedPhoto> {
      const file = files.get(candidate.sourceId)
      if (file === undefined) {
        return Promise.reject(new Error('source_unavailable'))
      }
      return Promise.resolve({ cleanup: () => Promise.resolve(), file })
    },
  }
  async function addFiles(picked: readonly File[]): Promise<ImportCandidate[]> {
    for (const file of picked) files.set(webSourceId(file), file)
    return createWebFilesSource(picked).list()
  }
  return {
    addFiles,
    getAccess: () => Promise.resolve('authorized'),
    hasLibrary: false,
    kind: 'web-files',
    list: () => Promise.resolve([]),
    mediaSource,
    async pick(): Promise<PickResult | null> {
      const picked = await choose()
      if (picked === null) return null
      return { candidates: await addFiles(picked), left: 0 }
    },
    requestAccess: () => Promise.resolve('authorized'),
    setAllowNetwork: () => undefined,
    thumbnails(ids): Promise<ThumbnailResult[]> {
      return Promise.resolve(
        ids.map((id) => {
          const file = files.get(id)
          if (!file?.type.startsWith('image/')) {
            return { cloud: false, id, src: null }
          }
          let url = urls.get(id)
          if (url === undefined) {
            url = URL.createObjectURL(file)
            urls.set(id, url)
          }
          return { cloud: false, id, src: url }
        }),
      )
    },
  }
}
