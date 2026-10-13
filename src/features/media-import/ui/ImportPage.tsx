import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { dexieUploadJobStore } from '@/entities/media/api/upload-jobs.store'
import {
  UPLOAD_JOB_STATES,
  type ImportCursor,
  type UploadJob,
} from '@/entities/media/model/upload-job'
import { useSession } from '@/features/auth/session/use-session'
import { createPhotoKitSource } from '@/features/media-import/api/photokit-source'
import { useImportQueue } from '@/features/media-import/api/use-import-queue'
import {
  createWebFilesSource,
  WEB_FILES_ACCEPT,
} from '@/features/media-import/api/web-files-source'
import {
  resolveRange,
  summarizeCandidates,
  type RangeChoice,
} from '@/features/media-import/model/range'
import type {
  ImportCandidate,
  MediaSource,
} from '@/features/media-import/model/types'
import { OrganizeJourneyButton } from '@/features/journey-organize/ui/OrganizeJourneyButton'
import {
  getMediaLibraryStatus,
  isMediaLibraryAvailable,
  requestMediaLibraryAccess,
} from '@/shared/lib/media-library'

const BUTTON =
  'min-h-10 rounded-md border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50'
const PRIMARY_BUTTON =
  'min-h-10 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50'

type RangeMode = RangeChoice['mode']

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function jobLabel(job: UploadJob, locale: string): string {
  if (job.sourceKind === 'web-files') {
    return job.sourceId.split('|').slice(0, -2).join('|') || job.sourceId
  }
  if (job.capturedAt !== null) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(Date.parse(job.capturedAt))
  }
  return job.sourceId.slice(0, 8)
}

export function ImportPage({ journeyId }: { journeyId: string }) {
  const { i18n, t } = useTranslation()
  const { user } = useSession()
  if (user === null) return null
  return (
    <ImportView
      journeyId={journeyId}
      locale={i18n.language}
      ownerId={user.id}
      t={t}
    />
  )
}

function ImportView({
  journeyId,
  locale,
  ownerId,
  t,
}: {
  journeyId: string
  locale: string
  ownerId: string
  t: ReturnType<typeof useTranslation>['t']
}) {
  const native = isMediaLibraryAvailable()
  const kind = native ? 'photokit' : 'web-files'
  const { queue, setSource, snapshot } = useImportQueue(journeyId, ownerId)
  const sourceRef = useRef<MediaSource | null>(null)

  const [cursor, setCursor] = useState<ImportCursor | null>(null)
  const [mode, setMode] = useState<RangeMode>('all')
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')
  const [icloud, setIcloud] = useState(false)
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<'accessDenied' | 'loadError' | null>(null)

  useEffect(() => {
    let cancelled = false
    void dexieUploadJobStore.getCursor(journeyId, kind).then((found) => {
      if (cancelled || found === null) return
      setCursor(found)
      setMode('since')
    })
    return () => {
      cancelled = true
    }
  }, [journeyId, kind])

  // The worker needs a source for jobs left over from an earlier session.
  useEffect(() => {
    if (native) setSource(createPhotoKitSource({ allowNetwork: icloud }))
  }, [native, icloud, setSource])

  function currentRange() {
    if (mode === 'since' && cursor !== null) {
      return resolveRange({
        lastCapturedAt: cursor.lastCapturedAt,
        mode: 'since',
      })
    }
    if (mode === 'dates') {
      return resolveRange({
        fromDay,
        mode: 'dates',
        timeZone: deviceTimeZone(),
        toDay,
      })
    }
    return undefined
  }

  async function scan() {
    setScanning(true)
    setError(null)
    setCandidates(null)
    try {
      let status = await getMediaLibraryStatus()
      if (status === 'notDetermined') status = await requestMediaLibraryAccess()
      if (status !== 'authorized' && status !== 'limited') {
        setError('accessDenied')
        return
      }
      const source = createPhotoKitSource({ allowNetwork: icloud })
      sourceRef.current = source
      setSource(source)
      setCandidates(await source.list(currentRange()))
    } catch {
      setError('loadError')
    } finally {
      setScanning(false)
    }
  }

  async function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return
    setError(null)
    try {
      const source = createWebFilesSource(files)
      sourceRef.current = source
      setSource(source)
      setCandidates(await source.list())
    } catch {
      setError('loadError')
    }
  }

  async function startImport() {
    const source = sourceRef.current
    if (source === null || candidates === null) return
    await queue.enqueue(source.kind, candidates)
    setCandidates(null)
    queue.start()
  }

  const summary = candidates === null ? null : summarizeCandidates(candidates)
  const importable = summary === null ? 0 : summary.photos + summary.videos
  const { counts, current, runtime } = snapshot
  const waiting = counts.pending + counts.paused
  const busy = runtime === 'running' || runtime === 'waiting_online'
  const finished =
    runtime === 'idle' &&
    counts.done > 0 &&
    waiting === 0 &&
    counts.processing === 0
  const problems = snapshot.jobs.filter(
    (job) => job.state === 'failed' || job.state === 'skipped',
  )

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-8">
      <div>
        <Link
          className="text-sm text-muted underline"
          params={{ journeyId }}
          to="/j/$journeyId/workspace"
        >
          {t('mediaImport.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          {t('mediaImport.title')}
        </h1>
      </div>

      <section aria-label={t('mediaImport.rangeLabel')} className="space-y-4">
        {native ? (
          <>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">
                {t('mediaImport.rangeLabel')}
              </legend>
              {cursor === null ? null : (
                <RangeOption
                  checked={mode === 'since'}
                  label={t('mediaImport.rangeSince', {
                    date: new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                    }).format(Date.parse(cursor.lastCapturedAt)),
                  })}
                  onSelect={() => {
                    setMode('since')
                  }}
                />
              )}
              <RangeOption
                checked={mode === 'dates'}
                label={t('mediaImport.rangeDates')}
                onSelect={() => {
                  setMode('dates')
                }}
              />
              {mode === 'dates' ? (
                <div className="flex flex-wrap gap-3 pl-8">
                  <label className="text-sm">
                    {t('mediaImport.dateFrom')}
                    <input
                      className="mt-1 block min-h-10 rounded-md border border-border px-2"
                      type="date"
                      value={fromDay}
                      onChange={(event) => {
                        setFromDay(event.target.value)
                      }}
                    />
                  </label>
                  <label className="text-sm">
                    {t('mediaImport.dateTo')}
                    <input
                      className="mt-1 block min-h-10 rounded-md border border-border px-2"
                      type="date"
                      value={toDay}
                      onChange={(event) => {
                        setToDay(event.target.value)
                      }}
                    />
                  </label>
                </div>
              ) : null}
              <RangeOption
                checked={mode === 'all'}
                label={t('mediaImport.rangeAll')}
                onSelect={() => {
                  setMode('all')
                }}
              />
            </fieldset>
            <div>
              <label className="flex min-h-10 items-center gap-3 text-sm font-semibold">
                <input
                  checked={icloud}
                  className="h-5 w-5"
                  type="checkbox"
                  onChange={(event) => {
                    setIcloud(event.target.checked)
                  }}
                />
                {t('mediaImport.icloudLabel')}
              </label>
              <p className="pl-8 text-sm text-muted">
                {t('mediaImport.icloudHint')}
              </p>
            </div>
            <button
              className={BUTTON}
              disabled={scanning || busy}
              type="button"
              onClick={() => void scan()}
            >
              {scanning ? t('mediaImport.scanning') : t('mediaImport.scan')}
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <label
              className={`${BUTTON} inline-flex cursor-pointer items-center`}
            >
              {t('mediaImport.chooseFiles')}
              <input
                accept={WEB_FILES_ACCEPT}
                className="sr-only"
                disabled={busy}
                multiple
                type="file"
                onChange={(event) => void pickFiles(event)}
              />
            </label>
            <p className="text-sm text-muted">
              {t('mediaImport.chooseFilesHint')}
            </p>
          </div>
        )}
        {error === null ? null : (
          <p className="text-sm text-destructive" role="alert">
            {t(`mediaImport.${error}`)}
          </p>
        )}
      </section>

      {summary === null ? null : (
        <section aria-label={t('mediaImport.start')} className="space-y-2">
          <ul className="text-sm">
            <li>{t('mediaImport.summaryPhotos', { count: summary.photos })}</li>
            <li>{t('mediaImport.summaryVideos', { count: summary.videos })}</li>
            <li>
              {t('mediaImport.summarySkipped', { count: summary.skippedTotal })}
            </li>
            {Object.entries(summary.skipped).map(([reason, count]) => (
              <li className="pl-4 text-muted" key={reason}>
                {t(`mediaImport.reason.${reason}`, {
                  defaultValue: t('mediaImport.reason.other'),
                })}{' '}
                ({count})
              </li>
            ))}
          </ul>
          {importable === 0 ? (
            <p className="text-sm text-muted">
              {t('mediaImport.nothingToImport')}
            </p>
          ) : null}
          <button
            className={PRIMARY_BUTTON}
            disabled={importable === 0 && summary.skippedTotal === 0}
            type="button"
            onClick={() => void startImport()}
          >
            {t('mediaImport.start')}
          </button>
        </section>
      )}

      {snapshot.jobs.length === 0 ? null : (
        <section aria-label={t('mediaImport.title')} className="space-y-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {UPLOAD_JOB_STATES.map((state) => (
              <li data-state={state} key={state}>
                {t(`mediaImport.state.${state}`, { count: counts[state] })}
              </li>
            ))}
          </ul>
          {runtime === 'waiting_online' ? (
            <p className="text-sm text-muted" role="status">
              {t('mediaImport.waitingOnline')}
            </p>
          ) : null}
          {current === null ? null : (
            <p className="text-sm" role="status">
              {t('mediaImport.current', {
                percent: Math.round(current.fraction * 100),
                phase: t(`mediaImport.phase.${current.phase}`),
              })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {runtime === 'running' || runtime === 'waiting_online' ? (
              <button
                className={BUTTON}
                type="button"
                onClick={() => void queue.pause()}
              >
                {t('mediaImport.pause')}
              </button>
            ) : null}
            {runtime === 'paused' || counts.paused > 0 ? (
              <button
                className={BUTTON}
                type="button"
                onClick={() => void queue.resume()}
              >
                {t('mediaImport.resume')}
              </button>
            ) : null}
            {runtime === 'idle' && counts.pending > 0 ? (
              <button
                className={BUTTON}
                type="button"
                onClick={() => {
                  queue.start()
                }}
              >
                {t('mediaImport.continue')}
              </button>
            ) : null}
            {counts.failed > 0 ? (
              <button
                className={BUTTON}
                type="button"
                onClick={() => void queue.retryFailed()}
              >
                {t('mediaImport.retryFailed')}
              </button>
            ) : null}
            {waiting > 0 ? (
              <button
                className={BUTTON}
                type="button"
                onClick={() => void queue.cancel()}
              >
                {t('mediaImport.cancel')}
              </button>
            ) : null}
          </div>
          {problems.length === 0 ? null : (
            <div>
              <h2 className="text-sm font-semibold">
                {t('mediaImport.problemsTitle')}
              </h2>
              <ul className="mt-1 divide-y divide-border text-sm">
                {problems.map((job) => (
                  <li className="py-2" key={job.id}>
                    <span className="font-medium">
                      {t(
                        job.mediaType === 'video'
                          ? 'mediaImport.itemVideo'
                          : 'mediaImport.itemPhoto',
                        { name: jobLabel(job, locale) },
                      )}
                    </span>
                    <span className="block text-muted">
                      {t(`mediaImport.reason.${job.lastError ?? 'other'}`, {
                        defaultValue: t('mediaImport.reason.other'),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {finished ? (
            <div className="space-y-2 rounded-xl border border-border p-4">
              <p className="text-sm font-semibold">
                {t('mediaImport.finished', { count: counts.done })}
              </p>
              <p className="text-sm text-muted">
                {t('mediaImport.organizeOffer')}
              </p>
              <OrganizeJourneyButton journeyId={journeyId} />
            </div>
          ) : null}
        </section>
      )}
    </main>
  )
}

function RangeOption({
  checked,
  label,
  onSelect,
}: {
  checked: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <label className="flex min-h-10 items-center gap-3 text-sm">
      <input
        checked={checked}
        className="h-5 w-5"
        name="import-range"
        type="radio"
        onChange={onSelect}
      />
      {label}
    </label>
  )
}
