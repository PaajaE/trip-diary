import { useState } from 'react'
import {
  diagnoseAsset,
  summarizeDiagnostics,
  type AssetDiagnostic,
  type LibraryDiagnosticsSummary,
} from '@/features/media-import/lib/library-diagnostics'
import {
  getMediaLibraryStatus,
  isMediaLibraryAvailable,
  listMediaLibraryAssets,
  readMediaLibraryEmbeddedMetadata,
  requestMediaLibraryAccess,
  type MediaLibraryEmbeddedMetadata,
  type MediaLibraryStatus,
} from '@/shared/lib/media-library'

/**
 * Developer diagnostics for v2 Phase 0 spike A (docs/plan-v2.md):
 * verifies PhotoKit returns location and capture time for every asset.
 */

const METADATA_CONCURRENCY = 4

interface MetadataFailure {
  id: string
  message: string
}

interface RunResult {
  diagnostics: AssetDiagnostic[]
  icloudDownload: boolean
  listMs: number
  metadataFailures: MetadataFailure[]
  metadataMs: number
  summary: LibraryDiagnosticsSummary
}

export function MediaLibraryDiagnosticsPage() {
  const [status, setStatus] = useState<MediaLibraryStatus | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [allowNetwork, setAllowNetwork] = useState(true)
  const [progress, setProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const available = isMediaLibraryAvailable()

  async function handleRequestAccess() {
    setError(null)
    try {
      setStatus(await requestMediaLibraryAccess())
    } catch (caught) {
      setError(describeError(caught))
    }
  }

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      setStatus(await getMediaLibraryStatus())
      const listed = await listMediaLibraryAssets()
      const started = performance.now()
      const metadataFailures: MetadataFailure[] = []
      let done = 0
      setProgress({ done, total: listed.assets.length })
      const diagnostics = await mapWithConcurrency(
        listed.assets,
        METADATA_CONCURRENCY,
        async (asset) => {
          let metadata: MediaLibraryEmbeddedMetadata | null = null
          if (asset.mediaType === 'image') {
            try {
              metadata = await readMediaLibraryEmbeddedMetadata(asset.id, {
                allowNetwork,
              })
            } catch (caught) {
              // One unreadable asset (e.g. iCloud download failed) must not
              // abort the whole run; it is counted and reported instead.
              metadataFailures.push({
                id: asset.id,
                message: describeError(caught),
              })
            }
          }
          done += 1
          setProgress({ done, total: listed.assets.length })
          return diagnoseAsset(asset, metadata)
        },
      )
      setResult({
        diagnostics,
        icloudDownload: allowNetwork,
        listMs: listed.elapsedMs,
        metadataFailures,
        metadataMs: Math.round(performance.now() - started),
        summary: summarizeDiagnostics(diagnostics),
      })
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 text-sm">
      <h1 className="text-xl font-semibold">Diagnostika knihovny fotek</h1>
      <p className="mt-1 text-muted">
        v2 · Fáze 0 · Spike A (PhotoKit). Jen pro vývoj.
      </p>

      {!available ? (
        <p className="mt-4 rounded-lg border border-border p-3">
          Plugin MediaLibrary není dostupný (spusťte aplikaci na iOS).
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-border px-3 py-2"
            onClick={() => void handleRequestAccess()}
            type="button"
          >
            Povolit přístup
          </button>
          <button
            className="rounded-lg bg-primary px-3 py-2 text-white disabled:opacity-50"
            disabled={running}
            onClick={() => void handleRun()}
            type="button"
          >
            {running ? 'Probíhá…' : 'Spustit diagnostiku'}
          </button>
        </div>
      )}

      {available && (
        <label className="mt-3 flex items-center gap-2">
          <input
            checked={allowNetwork}
            disabled={running}
            onChange={(event) => {
              setAllowNetwork(event.target.checked)
            }}
            type="checkbox"
          />
          Stahovat z iCloudu
        </label>
      )}
      {running && (
        <p className="mt-2" data-testid="media-library-progress">
          {allowNetwork
            ? 'Stahování originálů z iCloudu může trvat déle. '
            : ''}
          {progress === null
            ? 'Načítám výpis…'
            : `Zpracováno ${String(progress.done)}/${String(progress.total)}`}
        </p>
      )}

      {status !== null && (
        <p className="mt-3" data-testid="media-library-status">
          Přístup: <strong>{status}</strong>
        </p>
      )}
      {error !== null && (
        <p className="mt-3 text-destructive" role="alert">
          {error}
        </p>
      )}

      {result !== null && (
        <>
          <pre
            className="mt-4 overflow-x-auto rounded-lg bg-surface p-3 text-xs"
            data-testid="media-library-summary"
          >
            {JSON.stringify(
              {
                ...result.summary,
                icloudDownload: result.icloudDownload,
                listMs: result.listMs,
                metadataErrors: result.metadataFailures.length,
                metadataErrorSamples: result.metadataFailures
                  .slice(0, 5)
                  .map((failure) => failure.message),
                metadataMs: result.metadataMs,
              },
              null,
              2,
            )}
          </pre>
          <ol className="mt-4 space-y-2">
            {result.diagnostics.map((item) => (
              <li
                className="rounded-lg border border-border p-2 font-mono text-xs"
                key={item.asset.id}
              >
                <div>
                  {item.asset.mediaType} {item.asset.width}×{item.asset.height}{' '}
                  {item.asset.subtypes.join(',')}
                </div>
                <div>PHAsset: {item.asset.creationDate ?? '—'}</div>
                <div>
                  EXIF: {item.exifInstant ?? '—'}
                  {item.exifOffsetMinutes !== null &&
                    ` (UTC${formatOffset(item.exifOffsetMinutes)})`}
                </div>
                <div>
                  GPS:{' '}
                  {item.hasLocation
                    ? `${String(item.asset.latitude?.toFixed(5))}, ${String(item.asset.longitude?.toFixed(5))}`
                    : '—'}
                </div>
                <div>
                  čas: {item.time} · poloha: {item.location}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  )
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item !== undefined) {
        results[index] = await mapper(item)
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  )
  return results
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const absolute = Math.abs(minutes)
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0')
  const rest = String(absolute % 60).padStart(2, '0')
  return `${sign}${hours}:${rest}`
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
