import { useState } from 'react'
import { MediaUploadError } from '@/entities/media/model/media'
import { useSession } from '@/features/auth/session/use-session'
import {
  uploadVideo,
  type UploadedVideo,
  type VideoUploadProgress,
} from '@/features/media-upload/api/upload-video'
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

  async function handleList() {
    setError(null)
    try {
      await requestMediaLibraryAccess()
      const listed = await listMediaLibraryAssets({
        limit: LIST_LIMIT,
        mediaTypes: ['video'],
      })
      setAssets(listed.assets.slice(0, LIST_LIMIT))
    } catch (caught) {
      setError(describeError(caught))
    }
  }

  async function handleUpload(asset: MediaLibraryAsset) {
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
      <button
        className="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
        disabled={busy || user === null}
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
                disabled={busy || user === null || tooLong}
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
      {error === null ? null : <p role="alert">{error}</p>}
      {result === null ? null : (
        <pre className="overflow-x-auto rounded-lg bg-surface p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  )
}

function describeError(error: unknown): string {
  if (error instanceof MediaUploadError)
    return `${error.code}: ${error.message}`
  return error instanceof Error ? error.message : String(error)
}
