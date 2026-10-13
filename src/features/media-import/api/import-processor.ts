import type { UploadJob } from '@/entities/media/model/upload-job'
import {
  uploadPhoto,
  type UploadPhotoOptions,
} from '@/features/media-upload/api/upload-photo'
import {
  uploadVideo,
  type UploadVideoOptions,
} from '@/features/media-upload/api/upload-video'
import type { JobHooks } from '@/features/media-import/api/upload-queue'
import { ImportJobError } from '@/features/media-import/model/import-errors'
import type {
  ImportCandidate,
  ImportSourceKind,
  MediaSource,
} from '@/features/media-import/model/types'

export interface ImportProcessorDeps {
  /** Resolved lazily: sources are chosen after the queue is created. */
  getSource: (kind: ImportSourceKind) => MediaSource | undefined
  uploadPhoto: (
    file: File,
    options: UploadPhotoOptions,
  ) => Promise<{ mediaId: string }>
  uploadVideo: (options: UploadVideoOptions) => Promise<{ mediaId: string }>
}

export function jobToCandidate(job: UploadJob): ImportCandidate {
  return {
    byteSize: job.byteSize,
    capturedAt: job.capturedAt,
    durationMs: job.durationMs,
    latitude: job.latitude,
    longitude: job.longitude,
    mediaType: job.mediaType,
    sourceId: job.sourceId,
  }
}

/**
 * Runs one job: photos are opened from their source and go through
 * uploadPhoto; iOS videos go through uploadVideo(assetId) (native export).
 */
export function createImportProcessor(
  deps: Partial<ImportProcessorDeps> & Pick<ImportProcessorDeps, 'getSource'>,
): (job: UploadJob, hooks: JobHooks) => Promise<{ mediaId: string }> {
  const upload = deps.uploadPhoto ?? uploadPhoto
  const uploadVid = deps.uploadVideo ?? uploadVideo
  return async (job, hooks) => {
    if (job.mediaType === 'video') {
      if (job.sourceKind !== 'photokit') {
        throw new ImportJobError('skip', 'web_video_unsupported')
      }
      return uploadVid({
        assetId: job.sourceId,
        assetMetadata: {
          ...(job.capturedAt === null ? {} : { creationDate: job.capturedAt }),
          ...(job.latitude === null ? {} : { latitude: job.latitude }),
          ...(job.longitude === null ? {} : { longitude: job.longitude }),
        },
        journeyId: job.journeyId,
        onProgress: (progress) => {
          hooks.onPhase(progress.phase, progress.fraction)
        },
        ownerId: job.ownerId,
        sourceAssetId: job.sourceId,
      })
    }

    const source = deps.getSource(job.sourceKind)
    if (source === undefined) {
      // For example web files after a reload: the File objects are gone.
      throw new ImportJobError('fail', 'source_unavailable')
    }
    hooks.onPhase('exporting', 0)
    let opened: Awaited<ReturnType<MediaSource['open']>>
    try {
      opened = await source.open(jobToCandidate(job))
    } catch (error) {
      if (error instanceof Error && error.message === 'source_unavailable') {
        throw new ImportJobError('fail', 'source_unavailable')
      }
      throw error
    }
    try {
      return await upload(opened.file, {
        fallbackCapture: {
          ...(job.capturedAt === null ? {} : { creationDate: job.capturedAt }),
          ...(job.latitude === null ? {} : { latitude: job.latitude }),
          ...(job.longitude === null ? {} : { longitude: job.longitude }),
        },
        journeyId: job.journeyId,
        onProgress: (progress) => {
          hooks.onPhase(
            progress.phase,
            progress.totalVariants === 0
              ? 0
              : progress.completedVariants / progress.totalVariants,
          )
        },
        ownerId: job.ownerId,
        sourceAssetId: job.sourceId,
      })
    } finally {
      await opened.cleanup().catch(() => undefined)
    }
  }
}
