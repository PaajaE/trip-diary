import { Images, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dayRange,
  isoDay,
  sinceRange,
} from '@/features/media-import/model/range'
import { dayKey } from '@/features/media-import/model/triage'
import type { ImportRange } from '@/features/media-import/model/types'
import { createThumbnailLoader } from '@/features/media-import/api/thumbnail-loader'
import { useUploadEta } from '@/features/media-import/lib/use-upload-eta'
import {
  DoneScreen,
  IcloudWaitingScreen,
  MessageScreen,
  ResumeScreen,
  UploadScreen,
} from '@/features/media-import/ui/flow/UploadScreens'
import {
  PrimaryButton,
  QuietButton,
  SecondaryButton,
} from '@/features/media-import/ui/flow/flow-ui'
import { formatDayRange } from '@/features/media-import/model/triage-format'
import { summarizeOverview } from '@/features/media-import/model/triage'
import {
  ConfirmRestSheet,
  DismissedScreen,
  GridScreen,
  IcloudSheet,
} from '@/features/media-import/ui/flow/GridScreens'
import {
  QuickScreen,
  SeriesScreen,
} from '@/features/media-import/ui/flow/QuickScreens'
import { ThumbnailsContext } from '@/features/media-import/ui/flow/thumbnail-context'
import {
  estimateBytes,
  seriesAround,
} from '@/features/media-import/model/triage'
import {
  ConfirmAllSheet,
  OverviewScreen,
} from '@/features/media-import/ui/flow/OverviewScreens'
import {
  DeniedScreen,
  RangeSheet,
  ReadingScreen,
  SelectScreen,
} from '@/features/media-import/ui/flow/SelectScreens'
import {
  useImportFlow,
  type ImportFlowDeps,
} from '@/features/media-import/ui/flow/use-import-flow'
import type { FilesTriageSource } from '@/features/media-import/api/files-triage-source'

export interface ImportFlowProps extends ImportFlowDeps {
  /** Newest captured_at of earlier imports ("Od posledního importu"). */
  lastImportAt: string | null
  locale: string
  onClose: () => void
  /** Leaves for the sorting page ("Roztřídit do zastávek"). */
  onSort: () => void
  /** Prefilled range of the range sheet (default: the last 30 days). */
  defaultRange?: [string, string]
  timeZone: string
  /** Uploads wait for Wi-Fi (native, mobile data not allowed). */
  wifiOnly?: boolean
}

function hasAddFiles(source: object): source is FilesTriageSource {
  return 'addFiles' in source
}

/**
 * The import flow "Vybrat → Probrat → Nahrát" as a full-screen layer. The
 * screens follow docs/design/import-triage/import-triage.html.
 */
export function ImportFlow(props: ImportFlowProps) {
  const { i18n, t } = useTranslation()
  const flow = useImportFlow(props)
  const { source } = props
  const [dropping, setDropping] = useState(false)
  const [picking, setPicking] = useState(false)
  const [rangeCount, setRangeCount] = useState<
    { days: number; items: number } | 'counting' | null
  >(null)
  const [rangeDays, setRangeDays] = useState<[string, string]>(['', ''])
  const defaultDays = (): [string, string] => {
    if (props.defaultRange !== undefined) return props.defaultRange
    const end = new Date(props.now?.() ?? Date.now())
    return [isoDay(new Date(end.getTime() - 30 * 86_400_000)), isoDay(end)]
  }
  const countToken = useRef(0)
  const { markCloud } = flow
  const loaders = useMemo(
    () => ({
      grid: createThumbnailLoader(source, { onCloud: markCloud, size: 256 }),
      large: createThumbnailLoader(source, { onCloud: markCloud, size: 1024 }),
    }),
    [markCloud, source],
  )
  // Live count behind the range sheet (metadata query only), debounced.
  const countTimer = useRef<number | null>(null)
  function requestCount(fromDay: string, toDay: string) {
    setRangeDays([fromDay, toDay])
    if (countTimer.current !== null) window.clearTimeout(countTimer.current)
    const token = ++countToken.current
    if (fromDay === '' && toDay === '') {
      setRangeCount(null)
      return
    }
    setRangeCount('counting')
    countTimer.current = window.setTimeout(() => {
      source.list(dayRange(fromDay, toDay, props.timeZone)).then(
        (candidates) => {
          if (countToken.current !== token) return
          const days = new Set(
            candidates.flatMap((c) =>
              c.capturedAt === null
                ? []
                : [dayKey(c.capturedAt, props.timeZone)],
            ),
          )
          setRangeCount({
            days: days.size,
            items: candidates.filter((c) => c.skipReason === undefined).length,
          })
        },
        () => {
          if (countToken.current === token) setRangeCount(null)
        },
      )
    }, 250)
  }
  useEffect(
    () => () => {
      if (countTimer.current !== null) window.clearTimeout(countTimer.current)
    },
    [],
  )

  async function pick() {
    setPicking(true)
    try {
      await flow.pick()
    } finally {
      setPicking(false)
    }
  }

  const dropHandlers = hasAddFiles(source)
    ? {
        onDragLeave: () => {
          setDropping(false)
        },
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          setDropping(true)
        },
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          setDropping(false)
          const files = Array.from(event.dataTransfer.files)
          if (files.length === 0) return
          void source.addFiles(files).then((candidates) => {
            flow.ingestCandidates(candidates)
          })
        },
      }
    : undefined

  const uploadable = flow.scope.filter((item) => item.status !== 'dismissed')
  const uploadableCloud = uploadable.filter((item) => item.icloudOnly).length

  const selectedCloud = flow.scope.filter(
    (item) =>
      (item.status === 'kept' || item.status === 'starred') && item.icloudOnly,
  ).length
  const requestUpload = () => {
    if (flow.counts.found > 0 || selectedCloud > 0) {
      flow.setSheet({ kind: 'confirmRest' })
    } else void flow.startUpload('selected')
  }
  const quickItem =
    flow.quick === null
      ? null
      : (flow.items.find((i) => i.id === flow.quick?.queue[flow.quick.pos]) ??
        null)
  const seriesItems =
    flow.seriesId === null ? [] : seriesAround(flow.scope, flow.seriesId)

  const itemsBySource = useMemo(
    () => new Map(flow.items.map((item) => [item.sourceId, item])),
    [flow.items],
  )
  const uploadedItems = useMemo(
    () =>
      flow.items
        .filter(
          (item) =>
            item.status === 'uploaded' && item.selectionId === flow.selectionId,
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [flow.items, flow.selectionId],
  )
  const runJobs = flow.run.jobs
  const runActive = runJobs.some(
    (job) =>
      job.state === 'pending' ||
      job.state === 'paused' ||
      job.state === 'processing',
  )
  const runDone = runJobs.filter((job) => job.state === 'done').length
  const runFailed = runJobs.filter((job) => job.state === 'failed').length
  const jobSources = new Set(runJobs.map((job) => job.sourceId))
  const waitingIcloud = flow.scope.filter(
    (item) =>
      (item.status === 'kept' || item.status === 'starred') &&
      item.icloudOnly &&
      !jobSources.has(item.sourceId),
  ).length
  const etaMinutes = useUploadEta({
    finished: runDone,
    remaining: runJobs.length - runDone,
    running: props.snapshot.runtime === 'running',
  })
  const retryRef = useRef<() => void>(() => undefined)
  const [discarding, setDiscarding] = useState(false)

  const startPick = () => {
    retryRef.current = source.hasLibrary
      ? () => void flow.read(undefined, false)
      : () => void pick()
    retryRef.current()
  }

  const sinceRangeValue: ImportRange | undefined =
    props.lastImportAt === null ? undefined : sinceRange(props.lastImportAt)

  let step = flow.step
  if (
    step === 'upload' &&
    runJobs.length > 0 &&
    !runActive &&
    props.snapshot.runtime !== 'running'
  ) {
    step = waitingIcloud > 0 ? 'icloudWaiting' : 'done'
  }
  const overviewAll = summarizeOverview(
    flow.items.filter((item) => item.selectionId === flow.selectionId),
    props.timeZone,
  )
  const uploadDays = summarizeOverview(uploadedItems, props.timeZone)
  const locale = i18n.language

  let screen = null
  switch (step) {
    case 'select':
      screen = (
        <SelectScreen
          access={flow.access}
          {...(dropHandlers === undefined ? {} : { dropHandlers })}
          dropping={dropping}
          lastImportAt={props.lastImportAt}
          locale={i18n.language}
          onChooseRange={() => {
            setRangeDays(defaultDays())
            setRangeCount(null)
            flow.setSheet({ kind: 'range' })
          }}
          onClose={props.onClose}
          onOpenSettings={
            source.openSettings === undefined
              ? undefined
              : () => void source.openSettings?.()
          }
          onPick={startPick}
          onSince={() => {
            retryRef.current = () => void flow.read(sinceRangeValue, true)
            retryRef.current()
          }}
          pickedLeft={flow.pickedLeft}
          picking={picking}
          source={source}
        />
      )
      break
    case 'denied':
      screen = (
        <DeniedScreen
          onBack={() => {
            flow.setStep('select')
          }}
          onOpenSettings={
            source.openSettings === undefined
              ? undefined
              : () => void source.openSettings?.()
          }
          onRetry={() => {
            flow.setStep('select')
          }}
        />
      )
      break
    case 'overview':
      screen = (
        <OverviewScreen
          dismissedBefore={flow.previouslyDismissed.length}
          items={flow.scope}
          locale={i18n.language}
          onAll={() => {
            flow.setSheet({ kind: 'confirmAll' })
          }}
          onBack={() => {
            flow.setStep('select')
          }}
          onShowDismissed={() => {
            flow.setStep('dismissed')
          }}
          onTriage={() => {
            flow.setFilter('all')
            flow.setStep('grid')
          }}
          skipped={flow.summary.skipped}
          timeZone={props.timeZone}
        />
      )
      break
    case 'reading':
      screen = (
        <ReadingScreen onCancel={flow.cancelRead} progress={flow.progress} />
      )
      break
    case 'dismissed':
      screen = (
        <DismissedScreen
          counts={flow.counts}
          current={flow.scope.filter((item) => item.status === 'dismissed')}
          earlier={flow.previouslyDismissed}
          locale={i18n.language}
          onBack={() => {
            flow.setStep(flow.counts.total > 0 ? 'grid' : 'select')
          }}
          onFilter={(next) => {
            flow.setFilter(next)
            flow.setStep('grid')
          }}
          onRestore={(ids) => {
            flow.apply(new Set(ids), 'restore')
          }}
          onUpload={requestUpload}
          timeZone={props.timeZone}
        />
      )
      break
    case 'grid':
      screen = (
        <GridScreen
          counts={flow.counts}
          filter={flow.filter}
          items={flow.scope}
          locale={i18n.language}
          onBack={() => {
            flow.setStep('overview')
          }}
          onFilter={flow.setFilter}
          onKeepRest={(ids) => {
            flow.apply(new Set(ids), 'keep')
          }}
          onOpen={(item) => {
            if (item.icloudOnly) flow.setSheet({ id: item.id, kind: 'icloud' })
            else flow.startQuick(item.id)
          }}
          onQuick={() => {
            flow.startQuick(null)
          }}
          onShowDismissed={() => {
            flow.setStep('dismissed')
          }}
          onUpload={requestUpload}
          timeZone={props.timeZone}
        />
      )
      break
    case 'quick':
      screen = (
        <QuickScreen
          canUndo={(flow.quick?.history.length ?? 0) > 0}
          done={
            flow.quick === null || flow.quick.pos >= flow.quick.queue.length
          }
          index={flow.quick?.pos ?? 0}
          item={quickItem}
          left={flow.counts.found}
          locale={i18n.language}
          onClose={() => {
            flow.setStep('grid')
          }}
          onDecide={(decision) => {
            if (quickItem !== null) {
              flow.quickApply([{ decision, id: quickItem.id }], [])
            }
          }}
          onSeries={() => {
            if (quickItem !== null) {
              flow.setSeriesId(quickItem.id)
              flow.setStep('series')
            }
          }}
          onUndo={flow.quickUndo}
          seriesCount={
            quickItem === null
              ? 0
              : seriesAround(flow.scope, quickItem.id).length
          }
          timeZone={props.timeZone}
          total={flow.quick?.queue.length ?? 0}
          up={flow.counts.selected}
        />
      )
      break
    case 'series':
      screen = (
        <SeriesScreen
          locale={i18n.language}
          members={seriesItems}
          onBack={() => {
            flow.setStep('quick')
          }}
          onConfirm={(keep) => {
            flow.quickApply(
              seriesItems.map((member) => ({
                decision: keep.has(member.id) ? 'keep' : 'away',
                id: member.id,
              })),
              seriesItems.map((member) => member.id),
            )
            flow.setStep('quick')
          }}
          timeZone={props.timeZone}
        />
      )
      break
    case 'upload': {
      const variant =
        props.snapshot.runtime === 'paused'
          ? 'paused'
          : props.snapshot.runtime === 'waiting_online'
            ? 'offline'
            : 'running'
      screen = (
        <UploadScreen
          etaMinutes={etaMinutes}
          itemsBySource={itemsBySource}
          jobs={runJobs}
          locale={locale}
          onCancelRest={() => {
            void props.queue.cancel().then(() => {
              flow.setStep('grid')
            })
          }}
          onContinue={() => {
            props.queue.start()
          }}
          onHide={() => {
            flow.setStep('grid')
          }}
          onPause={() => void props.queue.pause()}
          onResume={() => void props.queue.resume()}
          onRetry={() => void props.queue.retryFailed()}
          onTriage={() => {
            flow.setStep('grid')
          }}
          remainingToTriage={flow.counts.found}
          snapshot={props.snapshot}
          timeZone={props.timeZone}
          uploadedItems={uploadedItems}
          variant={variant}
          wifiOnly={props.wifiOnly === true}
        />
      )
      break
    }
    case 'done':
      screen = (
        <DoneScreen
          days={uploadDays.days}
          dismissed={flow.counts.dismissed}
          failed={runFailed}
          left={flow.counts.found}
          locale={locale}
          mosaic={uploadedItems}
          onClose={props.onClose}
          onContinueTriage={() => {
            flow.setStep('grid')
          }}
          onPhone={flow.counts.total}
          onRetry={() => void props.queue.retryFailed()}
          onSort={props.onSort}
          timeZone={props.timeZone}
          uploaded={runDone}
        />
      )
      break
    case 'icloudWaiting':
      screen = (
        <IcloudWaitingScreen
          done={runDone}
          locale={locale}
          onClose={props.onClose}
          onGo={() => {
            flow.setIcloudDownload(true)
            void flow.startUpload('selected', true)
          }}
          timeZone={props.timeZone}
          total={runDone + waitingIcloud}
          uploadedItems={uploadedItems}
          waiting={waitingIcloud}
          wifiOnly={props.wifiOnly === true}
        />
      )
      break
    case 'resume':
      screen = (
        <ResumeScreen
          daysLabel={
            overviewAll.firstDay === null || overviewAll.lastDay === null
              ? ''
              : `${formatDayRange(overviewAll.firstDay, overviewAll.lastDay, locale)} · ${t('mediaImport.flow.overview.days', { count: overviewAll.days })}`
          }
          discarding={discarding}
          found={flow.counts.total + uploadedItems.length}
          hasUploadWork={runActive || flow.counts.selected > 0}
          left={flow.counts.found}
          locale={locale}
          onClose={props.onClose}
          onCloseSheet={() => {
            setDiscarding(false)
          }}
          onContinueTriage={() => {
            flow.setStep('grid')
          }}
          onContinueUpload={() => {
            if (runActive) {
              props.queue.start()
              flow.setStep('upload')
            } else requestUpload()
          }}
          onDiscard={() => {
            setDiscarding(true)
          }}
          onDiscardConfirm={() => {
            setDiscarding(false)
            void flow.discard()
          }}
          selected={uploadedItems.length + flow.counts.selected}
          timeZone={props.timeZone}
          triaged={flow.counts.total + uploadedItems.length - flow.counts.found}
          uploaded={uploadedItems.length}
          uploadedItems={uploadedItems}
        />
      )
      break
    case 'empty':
      screen = (
        <MessageScreen
          actions={
            <>
              <PrimaryButton onClick={startPick}>
                <Images aria-hidden="true" size={20} />
                {source.hasLibrary
                  ? t('mediaImport.flow.select.primary')
                  : t('mediaImport.flow.select.primaryWeb')}
              </PrimaryButton>
              {source.hasLibrary ? (
                <SecondaryButton
                  onClick={() => {
                    flow.setStep('select')
                    setRangeDays(defaultDays())
                    flow.setSheet({ kind: 'range' })
                  }}
                  small
                >
                  {t('mediaImport.flow.select.range')}
                </SecondaryButton>
              ) : null}
            </>
          }
          body={
            flow.summary.sinceEmpty && props.lastImportAt !== null
              ? t('mediaImport.flow.empty.lead', {
                  date: new Intl.DateTimeFormat(locale, {
                    day: 'numeric',
                    month: 'numeric',
                  }).format(Date.parse(props.lastImportAt)),
                })
              : t('mediaImport.flow.empty.leadRange')
          }
          done={['pick']}
          headerTitle={t('mediaImport.flow.overview.title')}
          icon="library"
          onBack={() => {
            flow.setStep('select')
          }}
          step="triage"
          title={t('mediaImport.flow.empty.title')}
        />
      )
      break
    case 'error':
      screen = (
        <MessageScreen
          actions={
            <>
              <PrimaryButton
                onClick={() => {
                  retryRef.current()
                }}
              >
                <RotateCcw aria-hidden="true" size={20} />
                {t('mediaImport.flow.error.retry')}
              </PrimaryButton>
              <QuietButton
                onClick={() => {
                  flow.setStep('select')
                }}
              >
                {t('mediaImport.flow.error.back')}
              </QuietButton>
            </>
          }
          body={t('mediaImport.flow.error.lead')}
          done={[]}
          headerTitle={t('mediaImport.flow.title')}
          icon="warning"
          onBack={() => {
            flow.setStep('select')
          }}
          step="pick"
          title={t('mediaImport.flow.error.title')}
        />
      )
      break
    case 'loading':
      screen = null
      break
  }

  const icloudItem =
    flow.sheet?.kind === 'icloud'
      ? flow.items.find((i) => i.id === (flow.sheet as { id: string }).id)
      : undefined
  const sheetNode =
    flow.sheet?.kind === 'confirmRest' ? (
      <ConfirmRestSheet
        allBytes={estimateBytes(uploadable)}
        allCount={uploadable.length}
        icloudCount={selectedCloud}
        icloudDownload={flow.icloudDownload}
        locale={i18n.language}
        onAll={() => void flow.startUpload('all')}
        onClose={() => {
          flow.setSheet(null)
        }}
        onIcloud={flow.setIcloudDownload}
        onReviewRest={() => {
          flow.setSheet(null)
          flow.setFilter('found')
          flow.setStep('grid')
        }}
        onSelected={() => void flow.startUpload('selected')}
        remaining={flow.counts.found}
        selected={flow.counts.selected}
      />
    ) : icloudItem !== undefined ? (
      <IcloudSheet
        item={icloudItem}
        locale={i18n.language}
        onClose={() => {
          flow.setSheet(null)
        }}
        onDecide={(decision) => {
          flow.apply(new Set([icloudItem.id]), decision)
          flow.setSheet(null)
        }}
        timeZone={props.timeZone}
      />
    ) : flow.sheet?.kind === 'confirmAll' ? (
      <ConfirmAllSheet
        count={uploadable.length}
        icloudCount={uploadableCloud}
        icloudDownload={flow.icloudDownload}
        items={uploadable}
        locale={i18n.language}
        onClose={() => {
          flow.setSheet(null)
        }}
        onGo={() => void flow.startUpload('all')}
        onIcloud={flow.setIcloudDownload}
        onReview={() => {
          flow.setSheet(null)
          flow.setStep('grid')
        }}
      />
    ) : null

  return (
    <div
      className="fixed inset-0 z-50 bg-background pt-[var(--flow-safe-top,env(safe-area-inset-top))] text-foreground"
      data-step={flow.step}
      data-testid="import-flow"
    >
      <ThumbnailsContext.Provider value={loaders}>
        {screen}
        {sheetNode}
      </ThumbnailsContext.Provider>
      {flow.sheet?.kind === 'range' ? (
        <RangeSheet
          count={rangeCount}
          initial={rangeDays}
          onApply={() => {
            const [fromDay, toDay] = rangeDays
            void flow.read(dayRange(fromDay, toDay, props.timeZone), false)
          }}
          onClose={() => {
            flow.setSheet(null)
          }}
          onRangeChange={requestCount}
        />
      ) : null}
    </div>
  )
}
