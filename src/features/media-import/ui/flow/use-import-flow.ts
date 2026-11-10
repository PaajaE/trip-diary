import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  isOpenTriageStatus,
  type TriageItem,
} from '@/entities/media/model/triage-item'
import type { TriageItemStore } from '@/entities/media/api/triage-items.store'
import type {
  QueueSnapshot,
  UploadQueue,
} from '@/features/media-import/api/upload-queue'
import type {
  LibraryAccess,
  TriageSource,
} from '@/features/media-import/api/triage-source'
import {
  decide,
  latestSelectionId,
  newSelectionId,
  reconcileRead,
  toCandidate,
  triageCounts,
  type TriageDecision,
  type TriageFilter,
} from '@/features/media-import/model/triage'
import type {
  ImportCandidate,
  ImportRange,
} from '@/features/media-import/model/types'

export type FlowStepName =
  | 'denied'
  | 'dismissed'
  | 'done'
  | 'empty'
  | 'error'
  | 'grid'
  | 'icloudWaiting'
  | 'loading'
  | 'overview'
  | 'quick'
  | 'reading'
  | 'resume'
  | 'select'
  | 'series'
  | 'upload'

export type FlowSheet =
  | { kind: 'confirmAll' }
  | { kind: 'confirmRest' }
  | { id: string; kind: 'icloud' }
  | { kind: 'range' }
  | null

export interface ImportFlowDeps {
  journeyId: string
  /** Fixed clock/ids for tests and the harness. */
  now?: () => number
  ownerId: string
  queue: UploadQueue
  random?: () => number
  snapshot: QueueSnapshot
  source: TriageSource
  /** Writes ★ to an uploaded media row. */
  starMedia: (mediaId: string) => Promise<void>
  /** Starting point (dev harness and tests); production starts from storage. */
  initial?: {
    filter?: TriageFilter
    progress?: ReadProgress
    quickId?: string
    seriesId?: string
    sheet?: FlowSheet
    step: FlowStepName
  }
  store: TriageItemStore
}

export interface ReadProgress {
  read: number
  total: number | null
}

export interface ReadSummary {
  dismissedBefore: number
  skipped: number
  /** The range label shown on the empty screen (null = manual pick). */
  sinceEmpty: boolean
}

/** All state and actions of the import flow; screens only render it. */
export function useImportFlow(deps: ImportFlowDeps) {
  const { journeyId, ownerId, queue, snapshot, source, store } = deps
  const clock = deps.now ?? (() => Date.now())
  const random = deps.random ?? Math.random
  const clockRef = useRef(clock)
  const randomRef = useRef(random)
  useEffect(() => {
    clockRef.current = clock
    randomRef.current = random
  })

  const [items, setItems] = useState<TriageItem[]>([])
  const itemsRef = useRef<TriageItem[]>([])
  const [step, setStep] = useState<FlowStepName>(
    deps.initial?.step ?? 'loading',
  )
  const [sheet, setSheet] = useState<FlowSheet>(deps.initial?.sheet ?? null)
  const [access, setAccess] = useState<LibraryAccess | null>(null)
  const [pickedLeft, setPickedLeft] = useState(0)
  const [filter, setFilter] = useState<TriageFilter>(
    deps.initial?.filter ?? 'all',
  )
  const [progress, setProgress] = useState<ReadProgress | null>(
    deps.initial?.progress ?? null,
  )
  const [summary, setSummary] = useState<ReadSummary>({
    dismissedBefore: 0,
    sinceEmpty: false,
    skipped: 0,
  })
  const [icloudDownload, setIcloudDownload] = useState(true)
  const [storeFailed, setStoreFailed] = useState(false)
  const [quickId, setQuickId] = useState<string | null>(
    deps.initial?.quickId ?? null,
  )
  const [seriesId, setSeriesId] = useState<string | null>(
    deps.initial?.seriesId ?? null,
  )
  const readToken = useRef(0)

  const commit = useCallback((next: TriageItem[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])

  const persist = useCallback(
    (changed: readonly TriageItem[]) => {
      if (changed.length === 0) return
      const byId = new Map(itemsRef.current.map((item) => [item.id, item]))
      for (const item of changed) byId.set(item.id, item)
      commit([...byId.values()])
      store.putItems(changed).then(
        () => {
          setStoreFailed(false)
        },
        () => {
          setStoreFailed(true)
        },
      )
    },
    [commit, store],
  )

  // Load what is remembered; decide between resume and a fresh start.
  useEffect(() => {
    const life = { cancelled: false }
    void (async () => {
      try {
        let stored = await store.listItems(journeyId, ownerId)
        if (source.kind === 'web-files') {
          // Chosen files cannot be reopened after a reload: drop open items,
          // keep the dismissed memory (stable ids).
          const stale = stored.filter((item) => isOpenTriageStatus(item.status))
          if (stale.length > 0) {
            await store.deleteItems(stale.map((item) => item.id))
            stored = stored.filter((item) => !isOpenTriageStatus(item.status))
          }
        }
        if (life.cancelled) return
        commit(stored)
        if (deps.initial === undefined) {
          const selection = latestSelectionId(stored)
          const open = stored.some(
            (item) =>
              item.selectionId === selection && isOpenTriageStatus(item.status),
          )
          setStep(open ? 'resume' : 'select')
        }
      } catch {
        if (!life.cancelled) {
          commit([])
          setStep(deps.initial?.step ?? 'select')
        }
      }
      try {
        if (!life.cancelled) setAccess(await source.getAccess())
      } catch {
        // access is re-checked when the author presses a button
      }
    })()
    return () => {
      life.cancelled = true
    }
    // Runs once per mount: deps are stable identities from the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectionId = useMemo(() => latestSelectionId(items), [items])
  const scope = useMemo(
    () =>
      items.filter(
        (item) =>
          item.selectionId === selectionId && item.status !== 'uploaded',
      ),
    [items, selectionId],
  )
  const previouslyDismissed = useMemo(
    () =>
      items.filter(
        (item) =>
          item.status === 'dismissed' && item.selectionId !== selectionId,
      ),
    [items, selectionId],
  )
  const counts = useMemo(() => triageCounts(scope), [scope])

  const ingest = useCallback(
    (candidates: readonly ImportCandidate[], sinceEmpty: boolean) => {
      const now = clockRef.current()
      const id = newSelectionId(now, randomRef.current)
      const result = reconcileRead(itemsRef.current, candidates, {
        journeyId,
        now: new Date(now).toISOString(),
        ownerId,
        selectionId: id,
        sourceKind: source.kind,
      })
      setSummary({
        dismissedBefore: result.dismissedBefore,
        sinceEmpty,
        skipped: result.skipped,
      })
      if (result.items.length === 0) {
        setStep('empty')
        return
      }
      persist(result.items)
      setFilter('all')
      setStep('overview')
    },
    [journeyId, ownerId, persist, source.kind],
  )

  const read = useCallback(
    async (range: ImportRange | undefined, sinceEmpty: boolean) => {
      const token = ++readToken.current
      setSheet(null)
      setPickedLeft(0)
      try {
        let status = await source.getAccess()
        if (status === 'notDetermined') status = await source.requestAccess()
        setAccess(status)
        if (status !== 'authorized' && status !== 'limited') {
          setStep('denied')
          return
        }
        setProgress({ read: 0, total: null })
        setStep('reading')
        const candidates = await source.list(range, (done, total) => {
          if (readToken.current === token) setProgress({ read: done, total })
        })
        if (readToken.current !== token) return
        ingest(candidates, sinceEmpty)
      } catch {
        if (readToken.current === token) setStep('error')
      }
    },
    [ingest, source],
  )

  const pick = useCallback(async () => {
    setPickedLeft(0)
    try {
      const result = await source.pick()
      if (result === null) return
      setPickedLeft(result.left)
      ingest(result.candidates, false)
    } catch {
      setStep('error')
    }
  }, [ingest, source])

  const cancelRead = useCallback(() => {
    readToken.current += 1
    setStep('select')
  }, [])

  const apply = useCallback(
    (ids: ReadonlySet<string>, decision: TriageDecision) => {
      const changed = decide(
        itemsRef.current,
        ids,
        decision,
        new Date(clockRef.current()).toISOString(),
      )
      persist(changed)
      return changed.length
    },
    [persist],
  )

  const markCloud = useCallback(
    (sourceIds: readonly string[]) => {
      const wanted = new Set(sourceIds)
      const changed = itemsRef.current
        .filter((item) => wanted.has(item.sourceId) && !item.icloudOnly)
        .map((item) => ({ ...item, icloudOnly: true }))
      persist(changed)
    },
    [persist],
  )

  // Items of the current selection that are (or were) part of an upload run.
  const run = useMemo(() => {
    const ids = new Set(
      items
        .filter(
          (item) =>
            item.selectionId === selectionId &&
            (item.status === 'kept' ||
              item.status === 'starred' ||
              item.status === 'uploaded'),
        )
        .map((item) => item.sourceId),
    )
    const jobs = snapshot.jobs.filter((job) => ids.has(job.sourceId))
    return { jobs }
  }, [items, selectionId, snapshot.jobs])

  const startUpload = useCallback(
    async (mode: 'all' | 'selected') => {
      source.setAllowNetwork(icloudDownload)
      const now = new Date(clockRef.current()).toISOString()
      let working = itemsRef.current
      if (mode === 'all') {
        const found = new Set(
          working
            .filter(
              (item) =>
                item.selectionId === selectionId && item.status === 'found',
            )
            .map((item) => item.id),
        )
        const kept = decide(working, found, 'keep', now)
        persist(kept)
        working = itemsRef.current
      }
      const chosen = working.filter(
        (item) =>
          item.selectionId === selectionId &&
          (item.status === 'kept' || item.status === 'starred'),
      )
      const upload = chosen.filter((item) => icloudDownload || !item.icloudOnly)
      setSheet(null)
      await queue.enqueue(source.kind, upload.map(toCandidate))
      queue.start()
      setStep('upload')
    },
    [icloudDownload, persist, queue, selectionId, source],
  )

  // A finished job turns its item into "uploaded"; ★ is written afterwards.
  const starred = useRef(new Set<string>())
  useEffect(() => {
    const doneBySource = new Map(
      snapshot.jobs
        .filter((job) => job.state === 'done')
        .map((job) => [job.sourceId, job]),
    )
    const finished = itemsRef.current
      .filter(
        (item) =>
          (item.status === 'kept' || item.status === 'starred') &&
          doneBySource.has(item.sourceId),
      )
      .map((item) => ({
        ...item,
        bestPending: item.status === 'starred',
        status: 'uploaded' as const,
        updatedAt: new Date(clockRef.current()).toISOString(),
      }))
    if (finished.length > 0) persist(finished)
    const pending = itemsRef.current.filter(
      (item) => item.status === 'uploaded' && item.bestPending,
    )
    for (const item of pending) {
      const mediaId = doneBySource.get(item.sourceId)?.mediaId
      if (mediaId === undefined || starred.current.has(item.id)) continue
      starred.current.add(item.id)
      deps.starMedia(mediaId).then(
        () => {
          persist([{ ...item, bestPending: false }])
        },
        () => {
          starred.current.delete(item.id)
        },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.jobs])

  const discard = useCallback(async () => {
    const open = itemsRef.current.filter((item) =>
      isOpenTriageStatus(item.status),
    )
    commit(itemsRef.current.filter((item) => !isOpenTriageStatus(item.status)))
    try {
      await store.deleteItems(open.map((item) => item.id))
    } catch {
      setStoreFailed(true)
    }
    setStep('select')
  }, [commit, store])

  return {
    access,
    apply,
    cancelRead,
    counts,
    discard,
    filter,
    ingestCandidates: (candidates: readonly ImportCandidate[]) => {
      ingest(candidates, false)
    },
    icloudDownload,
    items,
    markCloud,
    pick,
    pickedLeft,
    previouslyDismissed,
    progress,
    quickId,
    read,
    run,
    scope,
    selectionId,
    seriesId,
    setFilter,
    setIcloudDownload,
    setQuickId,
    setSeriesId,
    setSheet,
    setStep,
    sheet,
    startUpload,
    step,
    storeFailed,
    summary,
  }
}

export type ImportFlowState = ReturnType<typeof useImportFlow>
