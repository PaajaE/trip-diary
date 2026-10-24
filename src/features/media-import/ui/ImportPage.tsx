import {
  CheckCircle2,
  Image as ImageIcon,
  UploadCloud,
  Video,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { dexieUploadJobStore } from '@/entities/media/api/upload-jobs.store'
import {
  type ImportCursor,
  type UploadJob,
} from '@/entities/media/model/upload-job'
import { useSession } from '@/features/auth/session/use-session'
import {
  assetsToCandidates,
  createPhotoKitSource,
} from '@/features/media-import/api/photokit-source'
import { MAX_IMPORT_BATCH } from '@/features/media-import/model/limits'
import { useImportQueue } from '@/features/media-import/api/use-import-queue'
import type {
  QueueSnapshot,
  UploadQueue,
} from '@/features/media-import/api/upload-queue'
import { useUploadEta } from '@/features/media-import/lib/use-upload-eta'
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
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { buttonVariants } from '@/shared/ui/button-variants'
import { Card, SectionHeading } from '@/shared/ui/PageLayout'
import {
  getMediaLibraryStatus,
  MediaLibraryError,
  isMediaLibraryAvailable,
  pickMediaLibraryAssets,
  requestMediaLibraryAccess,
} from '@/shared/lib/media-library'

/** Rows rendered in the queue list before "+N more". */
const QUEUE_ROW_LIMIT = 100

const STATE_ORDER: Record<UploadJob['state'], number> = {
  processing: 0,
  failed: 1,
  skipped: 2,
  pending: 3,
  paused: 4,
  done: 5,
}

/** Finished thumbnails/names kept in the "just uploaded" list. */
const RECENT_LIMIT = 12

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
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<{
    left: number
    selected: number
  } | null>(null)
  const [error, setError] = useState<'accessDenied' | 'loadError' | null>(null)
  // Size of a selection that is over the batch limit and was not queued.
  const [overLimit, setOverLimit] = useState<number | null>(null)

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
    setOverLimit(null)
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

  async function pickFromLibrary() {
    setPicking(true)
    setError(null)
    setOverLimit(null)
    setPicked(null)
    try {
      const result = await pickMediaLibraryAssets()
      if (result.cancelled) return
      const found = assetsToCandidates(result.assets)
      if (found.length > MAX_IMPORT_BATCH) {
        setOverLimit(found.length)
        return
      }
      setPicked({
        left: Math.max(0, result.requested - result.resolved),
        selected: found.length,
      })
      if (found.length === 0) return
      setSource(createPhotoKitSource({ allowNetwork: icloud }))
      setCandidates(null)
      await queue.enqueue('photokit', found)
      queue.start()
    } catch (caught) {
      setError(
        caught instanceof MediaLibraryError && caught.code === 'NOT_AUTHORIZED'
          ? 'accessDenied'
          : 'loadError',
      )
    } finally {
      setPicking(false)
    }
  }

  async function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    await handleFiles(files)
  }

  async function handleFiles(files: File[]) {
    if (files.length === 0) return
    setError(null)
    setOverLimit(null)
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
    const { photos, videos } = summarizeCandidates(candidates)
    if (photos + videos > MAX_IMPORT_BATCH) return
    await queue.enqueue(source.kind, candidates)
    setCandidates(null)
    queue.start()
  }

  const summary = candidates === null ? null : summarizeCandidates(candidates)
  const importable = summary === null ? 0 : summary.photos + summary.videos
  const tooMany =
    overLimit ?? (importable > MAX_IMPORT_BATCH ? importable : null)
  const busy =
    snapshot.runtime === 'running' || snapshot.runtime === 'waiting_online'

  return (
    <div className="space-y-6">
      <Card>
        <section aria-label={t('mediaImport.rangeLabel')} className="space-y-4">
          {native ? (
            <>
              <div className="space-y-2">
                <Button
                  disabled={picking || scanning || busy}
                  onClick={() => void pickFromLibrary()}
                >
                  {picking
                    ? t('mediaImport.picking')
                    : t('mediaImport.chooseFromLibrary')}
                </Button>
                <p className="text-sm text-muted">
                  {t('mediaImport.chooseFromLibraryHint')}
                </p>
                {picked === null || picked.selected === 0 ? null : (
                  <p className="text-sm font-semibold" role="status">
                    {t('mediaImport.pickedCount', { count: picked.selected })}
                  </p>
                )}
                {picked === null || picked.left === 0 ? null : (
                  <p className="text-sm text-muted" role="status">
                    {t('mediaImport.pickedLimited', { count: picked.left })}
                  </p>
                )}
              </div>
              <h2 className="border-t border-border pt-4 text-sm font-semibold">
                {t('mediaImport.byDate')}
              </h2>
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
                        className="mt-1 block min-h-11 rounded-md border border-border bg-surface px-2"
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
                        className="mt-1 block min-h-11 rounded-md border border-border bg-surface px-2"
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
                <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
                  <input
                    checked={icloud}
                    className="size-5"
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
              <Button
                disabled={scanning || busy}
                variant="secondary"
                onClick={() => void scan()}
              >
                {scanning ? t('mediaImport.scanning') : t('mediaImport.scan')}
              </Button>
            </>
          ) : (
            <DropZone
              busy={busy}
              onFiles={(files) => void handleFiles(files)}
              onPick={(event) => void pickFiles(event)}
              t={t}
            />
          )}
          {error === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {t(`mediaImport.${error}`)}
            </p>
          )}
          {tooMany === null ? null : (
            <p className="text-sm text-destructive" role="alert">
              {t('mediaImport.batchLimit', {
                count: tooMany,
                max: MAX_IMPORT_BATCH,
              })}
            </p>
          )}
        </section>
      </Card>

      {summary === null ? null : (
        <Card>
          <section aria-label={t('mediaImport.start')} className="space-y-4">
            <ul className="grid grid-cols-3 gap-3 text-sm">
              <li className="rounded-md bg-background px-3 py-2">
                {t('mediaImport.summaryPhotos', { count: summary.photos })}
              </li>
              <li className="rounded-md bg-background px-3 py-2">
                {t('mediaImport.summaryVideos', { count: summary.videos })}
              </li>
              <li className="rounded-md bg-background px-3 py-2">
                {t('mediaImport.summarySkipped', {
                  count: summary.skippedTotal,
                })}
              </li>
            </ul>
            {Object.keys(summary.skipped).length === 0 ? null : (
              <ul className="space-y-1 text-sm text-muted">
                {Object.entries(summary.skipped).map(([reason, count]) => (
                  <li key={reason}>
                    {t(`mediaImport.reason.${reason}`, {
                      defaultValue: t('mediaImport.reason.other'),
                    })}{' '}
                    ({count})
                  </li>
                ))}
              </ul>
            )}
            {importable === 0 ? (
              <p className="text-sm text-muted">
                {t('mediaImport.nothingToImport')}
              </p>
            ) : null}
            <Button
              disabled={
                tooMany !== null ||
                (importable === 0 && summary.skippedTotal === 0)
              }
              onClick={() => void startImport()}
            >
              {t('mediaImport.start')}
            </Button>
          </section>
        </Card>
      )}

      {snapshot.jobs.length === 0 ? null : (
        <QueueSection
          journeyId={journeyId}
          locale={locale}
          queue={queue}
          snapshot={snapshot}
          t={t}
        />
      )}
    </div>
  )
}

type TFn = ReturnType<typeof useTranslation>['t']

function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 24
  const circumference = 2 * Math.PI * radius
  const fraction = total === 0 ? 0 : Math.min(done / total, 1)
  return (
    <svg
      aria-hidden="true"
      className="size-14 shrink-0 -rotate-90"
      viewBox="0 0 56 56"
    >
      <circle
        className="stroke-border"
        cx="28"
        cy="28"
        fill="none"
        r={radius}
        strokeWidth="5"
      />
      <circle
        className="stroke-primary transition-[stroke-dashoffset]"
        cx="28"
        cy="28"
        fill="none"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        strokeLinecap="round"
        strokeWidth="5"
      />
    </svg>
  )
}

function QueueSection({
  journeyId,
  locale,
  queue,
  snapshot,
  t,
}: {
  journeyId: string
  locale: string
  queue: UploadQueue
  snapshot: QueueSnapshot
  t: TFn
}) {
  const { counts, current, jobs, runtime } = snapshot
  const waiting = counts.pending + counts.paused
  const active = waiting > 0 || counts.processing > 0
  const finished = runtime === 'idle' && counts.done > 0 && !active
  const total = jobs.length
  const handled = counts.done + counts.skipped
  const minutesLeft = useUploadEta({
    finished: counts.done,
    remaining: waiting + counts.processing,
    running: runtime === 'running',
  })

  const failed = jobs.filter((job) => job.state === 'failed')
  // The snapshot carries no preview image, so "just uploaded" is a compact
  // list of the newest finished items, not a thumbnail strip.
  const recent = jobs
    .filter((job) => job.state === 'done')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT_LIMIT)
  const rows = jobs
    .filter((job) => job.state !== 'failed' && job.state !== 'done')
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state])
    .slice(0, QUEUE_ROW_LIMIT)
  const hiddenRows =
    jobs.filter((job) => job.state !== 'failed' && job.state !== 'done')
      .length - rows.length

  const name = (job: UploadJob) =>
    t(
      job.mediaType === 'video'
        ? 'mediaImport.itemVideo'
        : 'mediaImport.itemPhoto',
      {
        name: jobLabel(job, locale),
      },
    )
  const reason = (job: UploadJob) =>
    t(`mediaImport.reason.${job.lastError ?? 'other'}`, {
      defaultValue: t('mediaImport.reason.other'),
    })

  return (
    <section aria-label={t('mediaImport.title')}>
      <SectionHeading>{t('mediaImport.queueTitle')}</SectionHeading>
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <ProgressRing done={handled} total={total} />
          </div>
          <div
            aria-label={t('mediaImport.progressLabel')}
            aria-valuemax={total}
            aria-valuemin={0}
            aria-valuenow={handled}
            className="min-w-0"
            data-testid="upload-progress"
            role="progressbar"
          >
            <p className="text-lg font-semibold">
              {t('mediaImport.progressOf', { done: handled, total })}
            </p>
            {minutesLeft === null ? null : (
              <p className="text-sm text-muted" data-testid="upload-eta">
                {t('mediaImport.remaining', { count: minutesLeft })}
              </p>
            )}
          </div>
        </div>
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
            <Button variant="secondary" onClick={() => void queue.pause()}>
              {t('mediaImport.pause')}
            </Button>
          ) : null}
          {runtime === 'paused' || counts.paused > 0 ? (
            <Button variant="secondary" onClick={() => void queue.resume()}>
              {t('mediaImport.resume')}
            </Button>
          ) : null}
          {runtime === 'idle' && counts.pending > 0 ? (
            <Button
              variant="secondary"
              onClick={() => {
                queue.start()
              }}
            >
              {t('mediaImport.continue')}
            </Button>
          ) : null}
          {waiting > 0 ? (
            <Button variant="destructive" onClick={() => void queue.cancel()}>
              {t('mediaImport.cancel')}
            </Button>
          ) : null}
        </div>

        {failed.length === 0 ? null : (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3"
            data-testid="upload-failed"
          >
            <p className="text-sm font-semibold text-destructive">
              {t('mediaImport.failedTitle', { count: failed.length })}
            </p>
            <ul className="mt-2 divide-y divide-destructive/15 text-sm">
              {failed.map((job) => (
                <li className="py-2" data-job-state={job.state} key={job.id}>
                  <span className="block truncate font-medium">
                    {name(job)}
                  </span>
                  <span className="block text-muted">{reason(job)}</span>
                </li>
              ))}
            </ul>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => void queue.retryFailed()}
            >
              {t('mediaImport.retryFailed')}
            </Button>
          </div>
        )}

        {rows.length === 0 ? null : (
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {rows.map((job) => {
              const skipped = job.state === 'skipped'
              const isCurrent = current !== null && current.jobId === job.id
              const Icon = job.mediaType === 'video' ? Video : ImageIcon
              return (
                <li
                  className="flex items-start gap-3 px-3 py-2.5"
                  data-job-state={job.state}
                  key={job.id}
                >
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-muted"
                    size={16}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {name(job)}
                    </span>
                    {skipped ? (
                      <span className="block text-muted">{reason(job)}</span>
                    ) : null}
                    {isCurrent ? (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-border"
                      >
                        <span
                          className="block h-full rounded-full bg-primary transition-[width]"
                          style={{
                            width: `${String(Math.round(current.fraction * 100))}%`,
                          }}
                        />
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      skipped
                        ? 'bg-accent/10 text-accent-strong'
                        : 'bg-background text-muted',
                    )}
                  >
                    {t(`mediaImport.itemState.${job.state}`)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {hiddenRows > 0 ? (
          <p className="text-sm text-muted">
            {t('mediaImport.queueMore', { count: hiddenRows })}
          </p>
        ) : null}

        {recent.length === 0 ? null : (
          <div data-testid="upload-recent">
            <h3 className="text-sm font-semibold">
              {t('mediaImport.justUploaded')}
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {recent.map((job) => (
                <li
                  className="flex items-center gap-2"
                  data-job-state={job.state}
                  key={job.id}
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="shrink-0 text-primary"
                    size={14}
                  />
                  <span className="truncate">{name(job)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {finished ? (
          <div className="space-y-2 rounded-md bg-primary/5 p-4">
            <p className="text-sm font-semibold">
              {t('mediaImport.finished', { count: counts.done })}
            </p>
            <p className="text-sm text-muted">
              {t('mediaImport.organizeOffer')}
            </p>
            <OrganizeJourneyButton journeyId={journeyId} />
            <p className="pt-2 text-sm text-muted">
              {t('mediaImport.sortOffer')}
            </p>
            <Link
              className={buttonVariants({ variant: 'primary' })}
              params={{ journeyId }}
              to="/j/$journeyId/batch"
            >
              {t('mediaImport.sortBatch')}
            </Link>
          </div>
        ) : active || runtime !== 'idle' ? (
          <button
            className={cn(buttonVariants({ variant: 'primary' }), 'w-full')}
            data-testid="sort-locked"
            disabled
            type="button"
          >
            {t('mediaImport.sortLocked')}
          </button>
        ) : null}
      </Card>
    </section>
  )
}

function DropZone({
  busy,
  onFiles,
  onPick,
  t,
}: {
  busy: boolean
  onFiles: (files: File[]) => void
  onPick: (event: ChangeEvent<HTMLInputElement>) => void
  t: ReturnType<typeof useTranslation>['t']
}) {
  const [over, setOver] = useState(false)
  function allow(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    if (!busy) setOver(true)
  }
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors',
        over ? 'border-primary bg-primary/5' : 'border-border bg-background/50',
      )}
      data-testid="import-dropzone"
      onDragEnter={allow}
      onDragLeave={() => {
        setOver(false)
      }}
      onDragOver={allow}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        if (!busy) onFiles(Array.from(event.dataTransfer.files))
      }}
    >
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <UploadCloud size={22} />
      </span>
      <p className="mt-4 text-lg font-semibold">
        {over ? t('mediaImport.dropActive') : t('mediaImport.dropHint')}
      </p>
      <p className="my-2 text-sm text-muted">{t('mediaImport.dropOr')}</p>
      <label
        className={cn(
          buttonVariants({ variant: 'primary' }),
          'cursor-pointer has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-primary/55',
          busy && 'pointer-events-none opacity-50',
        )}
      >
        {t('mediaImport.chooseFiles')}
        <input
          accept={WEB_FILES_ACCEPT}
          className="sr-only"
          disabled={busy}
          multiple
          type="file"
          onChange={onPick}
        />
      </label>
      <p className="mt-4 max-w-md text-sm text-muted">
        {t('mediaImport.chooseFilesHint')}
      </p>
    </div>
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
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input
        checked={checked}
        className="size-5"
        name="import-range"
        type="radio"
        onChange={onSelect}
      />
      {label}
    </label>
  )
}
