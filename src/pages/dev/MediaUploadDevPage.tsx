import { useState, type ChangeEvent } from 'react'
import { MediaUploadError } from '@/entities/media/model/media'
import {
  uploadPhoto,
  type UploadedPhoto,
  type UploadProgress,
} from '@/features/media-upload/api/upload-photo'
import { useSession } from '@/features/auth/session/use-session'

/** Dev-only harness for the Phase 2 photo upload pipeline (not product UI). */
export function MediaUploadDevPage() {
  const { user } = useSession()
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [result, setResult] = useState<UploadedPhoto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file === undefined || user === null) {
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(
        await uploadPhoto(file, {
          onProgress: setProgress,
          ownerId: user.id,
        }),
      )
    } catch (caught) {
      setError(
        caught instanceof MediaUploadError
          ? `${caught.code}: ${caught.message}`
          : String(caught),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Media upload (dev)</h1>
      {user === null ? <p>Sign in first.</p> : null}
      <input
        accept="image/*"
        disabled={busy || user === null}
        onChange={(event) => void handleChange(event)}
        type="file"
      />
      {progress === null ? null : (
        <p>
          {progress.phase}: {progress.completedVariants}/
          {progress.totalVariants}
        </p>
      )}
      {error === null ? null : <p role="alert">{error}</p>}
      {result === null ? null : (
        <pre className="overflow-auto text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  )
}
