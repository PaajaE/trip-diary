import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dayRange,
  isoDay,
  sinceRange,
} from '@/features/media-import/model/range'
import { dayKey } from '@/features/media-import/model/triage'
import type { ImportRange } from '@/features/media-import/model/types'
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
}

function hasAddFiles(source: object): source is FilesTriageSource {
  return 'addFiles' in source
}

/**
 * The import flow "Vybrat → Probrat → Nahrát" as a full-screen layer. The
 * screens follow docs/design/import-triage/import-triage.html.
 */
export function ImportFlow(props: ImportFlowProps) {
  const { i18n } = useTranslation()
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

  const sinceRangeValue: ImportRange | undefined =
    props.lastImportAt === null ? undefined : sinceRange(props.lastImportAt)

  let screen = null
  switch (flow.step) {
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
          onPick={() => {
            if (source.hasLibrary) void flow.read(undefined, false)
            else void pick()
          }}
          onSince={() => void flow.read(sinceRangeValue, true)}
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
    case 'done':
    case 'empty':
    case 'error':
    case 'grid':
    case 'icloudWaiting':
    case 'loading':
    case 'quick':
    case 'resume':
    case 'series':
    case 'upload':
      screen = null
  }

  const sheetNode =
    flow.sheet?.kind === 'confirmAll' ? (
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
      {screen}
      {sheetNode}
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
