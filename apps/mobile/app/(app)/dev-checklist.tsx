import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { useAuth } from '@/platform/auth/AuthProvider'
import { fetchJourneyListRemote } from '@/features/journeys/api/journeys.repository'
import { resolveDefaultSpaceId } from '@/features/spaces/api/spaces.repository'
import {
  capturePhoto,
  createPhotoId,
  getCurrentLocation,
  getLocalFileByteSize,
  persistPhotoLocally,
  pickPhoto,
  type PickedMedia,
  type PickedPhoto,
} from '@/platform/media/photo'
import { isPickedVideo } from '@/platform/media/picked-media'
import { resolveMapStyle } from '@trip-diary/maps'
import { mobilePublicEnv } from '@/platform/env'
import { PHOTO_UPLOAD_OPERATION } from '@/platform/sync/photo-upload'
import { PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES } from '@/platform/sync/photo-storage-limits'
import { enqueueSyncOperationForApp } from '@/platform/sync/enqueue-operation'
import {
  getSyncOperation,
  markSyncOperationStatus,
  peekNextSyncOperation,
  processNextSyncOperation,
} from '@/platform/sync/queue'
import { colors, spacing } from '@/foundation/theme'

interface PendingPhotoUpload {
  byteSize: number
  capturedAt: string | null
  height: number
  journeyId: string
  localUri: string
  mimeType: PickedPhoto['mimeType']
  originalFilename: string
  photoId: string
  width: number
}

function formatSyncFailureDetail(payload: Record<string, unknown>): string {
  const lastError =
    typeof payload.lastError === 'string'
      ? payload.lastError
      : payload.lastError === undefined
        ? 'unknown'
        : JSON.stringify(payload.lastError)
  const retryable =
    typeof payload.retryable === 'boolean'
      ? String(payload.retryable)
      : payload.retryable === undefined
        ? 'unknown'
        : JSON.stringify(payload.retryable)

  return `Failure: ${lastError}; retryable=${retryable}`
}

export default function DevChecklistScreen() {
  const { user } = useAuth()
  const [log, setLog] = useState<string>('Ready.')
  const [journeyId, setJourneyId] = useState<string | null>(null)
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhotoUpload | null>(
    null,
  )
  const [lastUploadOperationId, setLastUploadOperationId] = useState<
    string | null
  >(null)

  useEffect(() => {
    if (user?.id === undefined) {
      setJourneyId(null)
      return
    }

    void resolveDefaultSpaceId(user.id)
      .then((spaceId) => fetchJourneyListRemote(spaceId))
      .then((journeys) => {
        setJourneyId(journeys[0]?.id ?? null)
      })
      .catch(() => {
        setJourneyId(null)
      })
  }, [user?.id])

  function append(message: string): void {
    setLog((current) => `${current}\n${message}`)
  }

  async function handlePickPhoto(): Promise<void> {
    try {
      const picked = await pickPhoto()
      if (picked === null) {
        append('Photo pick canceled.')
        return
      }

      await persistAndStagePhoto('Gallery', picked)
    } catch (error) {
      append(
        `Photo error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async function handleCapturePhoto(): Promise<void> {
    try {
      const captured = await capturePhoto()
      if (captured === null) {
        append('Camera capture canceled.')
        return
      }

      await persistAndStagePhoto('Camera', captured)
    } catch (error) {
      append(
        `Camera error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async function persistAndStagePhoto(
    source: 'Gallery' | 'Camera',
    picked: PickedMedia,
  ): Promise<void> {
    if (isPickedVideo(picked)) {
      append(`${source}: video clips are not staged in dev-checklist yet.`)
      return
    }
    if (journeyId === null) {
      append('No journey available for upload staging.')
      return
    }

    const photoId = createPhotoId()
    const filename = `dev-checklist-${source.toLowerCase()}-${photoId}.jpg`
    const persisted = await persistPhotoLocally(picked.uri, filename)
    const byteSize = await getLocalFileByteSize(persisted)

    const staged: PendingPhotoUpload = {
      byteSize,
      capturedAt: picked.metadata.capturedAt,
      height: picked.height,
      journeyId,
      localUri: persisted,
      mimeType: picked.mimeType,
      originalFilename: filename,
      photoId,
      width: picked.width,
    }

    setPendingPhoto(staged)
    append(`${source} staged for upload.`)
    append(`Photo ID: ${photoId}`)
    append(`Persisted: ${persisted}`)
    append(
      `EXIF capturedAt: ${picked.metadata.capturedAt ?? 'null'}; GPS: ${picked.metadata.latitude === null ? 'null' : String(picked.metadata.latitude)}, ${picked.metadata.longitude === null ? 'null' : String(picked.metadata.longitude)}`,
    )
  }

  function handleOsmFallbackMissingKey(): void {
    const resolved = resolveMapStyle({
      defaultProvider: 'mapy-tourist',
    })
    append(
      `OSM fallback (missing key): provider=${resolved.providerId}, reason=${resolved.reason}, attribution=${resolved.attribution}`,
    )
    if (__DEV__) {
      console.log(
        `[DevChecklist] OSM fallback missing key: provider=${resolved.providerId} reason=${resolved.reason}`,
      )
    }
  }

  function handleOsmFallbackInvalidKey(): void {
    const resolved = resolveMapStyle({
      apiKey: 'invalid-key-for-test',
      defaultProvider: 'mapy-tourist',
    })
    const basemap = resolved.style.sources.basemap as
      | { url?: string }
      | undefined
    append(
      `Invalid key resolution: provider=${resolved.providerId}, reason=${resolved.reason}`,
    )
    if (basemap?.url !== undefined) {
      append('Invalid key still selects Mapy at config time.')
    }
    if (__DEV__) {
      console.log(
        `[DevChecklist] invalid key resolution: provider=${resolved.providerId} reason=${resolved.reason}`,
      )
    }
  }

  async function handleCurrentLocation(): Promise<void> {
    try {
      const location = await getCurrentLocation()
      if (location === null) {
        append('Location unavailable or permission denied.')
        return
      }

      append(
        `Location: ${String(location.latitude)}, ${String(location.longitude)}`,
      )
    } catch (error) {
      append(
        `Location error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async function handleEnqueuePhotoUpload(): Promise<void> {
    try {
      if (pendingPhoto === null) {
        append('Pick or capture a photo before enqueueing upload.')
        return
      }

      const operationId = `photo-upload-${pendingPhoto.photoId}`
      await enqueueSyncOperationForApp({
        id: operationId,
        operationType: PHOTO_UPLOAD_OPERATION,
        payload: {
          byteSize: pendingPhoto.byteSize,
          capturedAt: pendingPhoto.capturedAt,
          height: pendingPhoto.height,
          journeyId: pendingPhoto.journeyId,
          localUri: pendingPhoto.localUri,
          mimeType: pendingPhoto.mimeType,
          originalFilename: pendingPhoto.originalFilename,
          photoId: pendingPhoto.photoId,
          variant: 'full',
          width: pendingPhoto.width,
        },
        userId: user?.id ?? null,
      })

      setLastUploadOperationId(operationId)
      const pending = await peekNextSyncOperation()
      append(
        `Upload enqueued: ${operationId}; next pending: ${pending?.id ?? 'null'}`,
      )
    } catch (error) {
      append(
        `Upload enqueue error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async function handleProcessQueue(): Promise<void> {
    try {
      const processed = await processNextSyncOperation()
      if (processed === null) {
        append('No pending sync operations.')
        return
      }

      append(
        `Processed: ${processed.operation.id} → ${processed.status}; type=${processed.operation.operationType}`,
      )

      if (processed.remoteStoragePath !== undefined) {
        append(`Remote storage path: ${processed.remoteStoragePath}`)
      }

      if (processed.status === 'failed') {
        append(
          `Failure: ${formatSyncFailureDetail(processed.operation.payload)}`,
        )
      }

      const next = await peekNextSyncOperation()
      append(`Next pending: ${next?.id ?? 'null'}`)
    } catch (error) {
      append(
        `Queue process error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  async function handleRetryUpload(): Promise<void> {
    try {
      if (lastUploadOperationId === null) {
        append('No staged upload operation to retry.')
        return
      }

      const operation = await getSyncOperation(lastUploadOperationId)
      if (operation === null) {
        append(`Upload operation not found: ${lastUploadOperationId}`)
        return
      }

      if (operation.payload.retryable === false) {
        append('Last upload failure is terminal and should not be retried.')
        return
      }

      await markSyncOperationStatus(lastUploadOperationId, 'pending')
      append(`Reset ${lastUploadOperationId} to pending.`)
      await handleProcessQueue()
    } catch (error) {
      append(
        `Upload retry error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.subtitle}>
        Device-only helpers for photo upload, location, and sync queue
        validation.
      </Text>

      <Pressable style={styles.button} onPress={() => void handlePickPhoto()}>
        <Text style={styles.buttonText}>Pick photo + persist</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => void handleCapturePhoto()}
      >
        <Text style={styles.buttonText}>Capture photo + persist</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => void handleCurrentLocation()}
      >
        <Text style={styles.buttonText}>Get current location</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={handleOsmFallbackMissingKey}>
        <Text style={styles.buttonText}>Test OSM fallback (missing key)</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={handleOsmFallbackInvalidKey}>
        <Text style={styles.buttonText}>Test Mapy with invalid key</Text>
      </Pressable>
      <Text style={styles.envHint}>
        Mapy key configured: {mobilePublicEnv.mapyApiKey ? 'yes' : 'no'}
      </Text>
      <Text style={styles.envHint}>
        Upload journey: {journeyId ?? 'loading…'}
      </Text>
      <Text style={styles.envHint}>
        Staged photo: {pendingPhoto?.photoId ?? 'none'}
        {pendingPhoto !== null
          ? ` (${String(pendingPhoto.byteSize)} bytes; limit ${String(PHOTOS_BUCKET_FILE_SIZE_LIMIT_BYTES)})`
          : ''}
      </Text>
      <Pressable
        style={styles.button}
        onPress={() => void handleEnqueuePhotoUpload()}
      >
        <Text style={styles.buttonText}>Enqueue staged photo upload</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => void handleProcessQueue()}
      >
        <Text style={styles.buttonText}>Process sync queue</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => void handleRetryUpload()}>
        <Text style={styles.buttonText}>Retry last upload</Text>
      </Pressable>

      <Text style={styles.log}>{log}</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginBottom: spacing.sm,
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  container: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.lg,
  },
  envHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  log: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
})
