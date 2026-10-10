import { useState } from 'react'
import { deleteMediaObjectsRemote } from '@/entities/media/api/media-upload.api'
import { deleteMedia } from '@/entities/media/api/media.repository'
import { MediaUploadError } from '@/entities/media/model/media'
import { useSession } from '@/features/auth/session/use-session'
import {
  uploadVideo,
  type UploadedVideo,
  type VideoUploadProgress,
} from '@/features/media-upload/api/upload-video'
import { deleteExportedFiles, exportVideo } from '@/shared/lib/video-pipeline'
import {
  listMediaLibraryAssets,
  requestMediaLibraryAccess,
  type MediaLibraryAsset,
} from '@/shared/lib/media-library'

/**
 * Native-only dev harness for the T7 video pipeline. Nothing happens until a
 * specific video is tapped. Not product UI.
 */

const LIST_LIMIT = 20
const MAX_DURATION_MS = 60_000

export function VideoUploadDevPage() {
  const { user } = useSession()
  const [assets, setAssets] = useState<MediaLibraryAsset[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<VideoUploadProgress | null>(null)
  const [result, setResult] = useState<UploadedVideo | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Safe default: only export (local, no network, nothing written to Supabase or R2).
  const [exportOnly, setExportOnly] = useState(true)
  const [deleted, setDeleted] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<Record<
    string,
    unknown
  > | null>(null)

  async function handleList() {
    setError(null)
    try {
      await requestMediaLibraryAccess()
      // Listing reads local metadata only. Newest videos within the 60 s limit.
      const listed = await listMediaLibraryAssets({ mediaTypes: ['video'] })
      setAssets(
        listed.assets
          .filter((asset) => (asset.durationMs ?? 0) <= MAX_DURATION_MS)
          .sort((a, b) =>
            (b.creationDate ?? '').localeCompare(a.creationDate ?? ''),
          )
          .slice(0, LIST_LIMIT),
      )
    } catch (caught) {
      setError(describeError(caught))
    }
  }

  async function handleExportOnly(asset: MediaLibraryAsset) {
    setBusy(true)
    setError(null)
    setResult(null)
    setProgress(null)
    setExportResult(null)
    try {
      const { elapsedMs, value: exported } = await timed(() =>
        exportVideo({ assetId: asset.id }),
      )
      setExportResult({
        durationMs: exported.durationMs,
        elapsedMs,
        mimeType: exported.mimeType,
        posterByteSize: exported.posterByteSize,
        posterSize: `${String(exported.posterWidth)}x${String(exported.posterHeight)}`,
        size: `${String(exported.width)}x${String(exported.height)}`,
        videoByteSize: exported.byteSize,
      })
      await deleteExportedFiles([exported.fileUrl, exported.posterUrl])
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  /** Test cleanup: removes the R2 objects first, the row only if that worked. */
  async function handleDeleteUploaded() {
    if (result === null) return
    setBusy(true)
    setError(null)
    try {
      const removed = await deleteMediaObjectsRemote(result.mediaId)
      await deleteMedia(result.mediaId)
      setResult(null)
      setProgress(null)
      setDeleted(`Deleted ${String(removed)} objects and the media row`)
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(asset: MediaLibraryAsset) {
    setDeleted(null)
    if (exportOnly) {
      await handleExportOnly(asset)
      return
    }
    if (user === null) return
    setBusy(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      setResult(
        await uploadVideo({
          assetId: asset.id,
          assetMetadata: {
            ...(asset.creationDate === undefined
              ? {}
              : { creationDate: asset.creationDate }),
            ...(asset.latitude === undefined
              ? {}
              : { latitude: asset.latitude }),
            ...(asset.longitude === undefined
              ? {}
              : { longitude: asset.longitude }),
          },
          onProgress: setProgress,
          ownerId: user.id,
          sourceAssetId: asset.id,
        }),
      )
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6 text-sm">
      <h1 className="text-xl font-semibold">Video upload (dev)</h1>
      {user === null ? (
        <p>Sign in first.</p>
      ) : (
        <p>Signed in as {user.email ?? user.id}</p>
      )}
      <label className="flex items-center gap-2">
        <input
          checked={exportOnly}
          disabled={busy}
          onChange={(event) => {
            setExportOnly(event.target.checked)
          }}
          type="checkbox"
        />
        Export only (no upload, nothing is written anywhere)
      </label>
      <button
        className="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
        disabled={busy}
        onClick={() => void handleList()}
        type="button"
      >
        List recent videos
      </button>
      <ul className="space-y-2">
        {assets.map((asset) => {
          const durationMs = asset.durationMs ?? 0
          const tooLong = durationMs > MAX_DURATION_MS
          return (
            <li key={asset.id}>
              <button
                className="w-full rounded-lg border border-border p-2 text-left disabled:opacity-50"
                disabled={busy || (!exportOnly && user === null) || tooLong}
                onClick={() => void handleUpload(asset)}
                type="button"
              >
                {(durationMs / 1000).toFixed(1)} s · {asset.width}x
                {asset.height} · {asset.creationDate ?? 'no date'}
                {tooLong ? ' · longer than 60 s' : ''}
              </button>
            </li>
          )
        })}
      </ul>
      {progress === null ? null : (
        <p data-testid="video-upload-progress">
          {progress.phase}: {progress.bytesSent}/{progress.totalBytes} bytes (
          {Math.round(progress.fraction * 100)}%)
        </p>
      )}
      {busy && exportOnly ? <p>Exporting… this can take a while.</p> : null}
      {exportResult === null ? null : (
        <pre className="overflow-x-auto rounded-lg bg-surface p-3 text-xs">
          {JSON.stringify(exportResult, null, 2)}
        </pre>
      )}
      {error === null ? null : <p role="alert">{error}</p>}
      {deleted === null ? null : <p>{deleted}</p>}
      {result === null ? null : (
        <button
          className="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
          disabled={busy}
          onClick={() => void handleDeleteUploaded()}
          type="button"
        >
          Delete uploaded (R2 objects + row)
        </button>
      )}
      {result === null ? null : (
        <pre className="overflow-x-auto rounded-lg bg-surface p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  )
}

async function timed<T>(
  run: () => Promise<T>,
): Promise<{ elapsedMs: number; value: T }> {
  const started = performance.now()
  const value = await run()
  return { elapsedMs: Math.round(performance.now() - started), value }
}

function describeError(error: unknown): string {
  if (error instanceof MediaUploadError)
    return `${error.code}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}
