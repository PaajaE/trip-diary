import { triageItemId } from '@/entities/media/model/triage-item'
import type { TriageItem } from '@/entities/media/model/triage-item'
import type { QueueSnapshot } from '@/features/media-import/api/upload-queue'
import type { ImportFlowDeps } from '@/features/media-import/ui/flow/use-import-flow'
import type { LibraryAccess } from '@/features/media-import/api/triage-source'
import { DEMO_JOURNEY, seedItems } from '@/pages/dev/import-triage/demo-data'
import { demoJob, snapshotOf } from '@/pages/dev/import-triage/fake-queue'

export interface Scenario {
  access: LibraryAccess
  hold?: { read: number; total: number }
  initial: NonNullable<ImportFlowDeps['initial']>
  items: TriageItem[]
  lastImportAt: string | null
  listFails?: boolean
  /** Extra source ids that have no local preview (iCloud only). */
  cloud: Set<string>
  online?: boolean
  snapshot: QueueSnapshot
  total: number
}

const EMPTY = snapshotOf([], 'idle')
const SINCE = '2026-10-12T10:00:00.000Z'
const MIX = { dismissed: 23, kept: 84, starred: 12 }

/** Ids of the first n selected demo items, for upload job fixtures. */
function selectedIds(items: TriageItem[]): string[] {
  return items
    .filter((i) => i.status === 'kept' || i.status === 'starred')
    .map((i) => i.sourceId)
}

function uploadSnapshot(
  items: TriageItem[],
  runtime: QueueSnapshot['runtime'],
  done: number,
  skipCloud = false,
): QueueSnapshot {
  const ids = selectedIds(items.filter((i) => !skipCloud || !i.icloudOnly))
  const jobs = ids.map((id, i) =>
    i < done
      ? demoJob(id, 'done', { mediaId: `m-${id}` })
      : i === done && runtime === 'running'
        ? demoJob(id, 'processing')
        : i === done + 1 && runtime === 'running'
          ? demoJob(id, 'failed', { lastError: 'network' })
          : demoJob(id, runtime === 'paused' ? 'paused' : 'pending'),
  )
  const current =
    runtime === 'running' && ids[done] !== undefined
      ? {
          fraction: 0.64,
          jobId: jobs[done]?.id ?? '',
          phase: 'exporting' as const,
          sourceId: ids[done] ?? '',
        }
      : null
  return snapshotOf(jobs, runtime, current)
}

/** Makes exactly `count` selected items iCloud-only (as in the mockup). */
function withSelectedCloud(
  items: TriageItem[],
  count: number,
): { cloud: Set<string>; items: TriageItem[] } {
  const cloud = new Set<string>()
  const selected = items.filter(
    (item) => item.status === 'kept' || item.status === 'starred',
  )
  // The last selected items wait for iCloud; the uploaded ones have previews.
  for (const item of selected.slice(-count)) cloud.add(item.sourceId)
  const next = items.map((item) =>
    item.status === 'kept' || item.status === 'starred'
      ? { ...item, icloudOnly: cloud.has(item.sourceId) }
      : item,
  )
  return { cloud, items: next }
}

export function buildScenario(name: string): Scenario {
  const seeded = seedItems({ dismissedBefore: 40, statuses: MIX, total: 330 })
  const { cloud: selectedCloud, items: mixed } = withSelectedCloud(seeded, 14)
  const fresh = seedItems({ dismissedBefore: 40, total: 330 })
  const base = {
    access: 'authorized' as const,
    cloud: selectedCloud,
    items: [] as TriageItem[],
    lastImportAt: SINCE,
    snapshot: EMPTY,
    total: 330,
  }
  switch (name) {
    case 'a-limited':
      return { ...base, access: 'limited', initial: { step: 'select' } }
    case 'a-denied':
      return { ...base, access: 'denied', initial: { step: 'denied' } }
    case 'a-range':
      return {
        ...base,
        initial: { sheet: { kind: 'range' }, step: 'select' },
      }
    case 'a-reading':
      return {
        ...base,
        hold: { read: 211, total: 330 },
        initial: { progress: { read: 211, total: 330 }, step: 'reading' },
      }
    case 'b-overview':
      return { ...base, items: fresh, initial: { step: 'overview' } }
    case 'b-large':
      return {
        ...base,
        items: seedItems({ dismissedBefore: 40, total: 2714 }),
        initial: { step: 'overview' },
        total: 2714,
      }
    case 'b-confirm':
      return {
        ...base,
        items: fresh,
        initial: { sheet: { kind: 'confirmAll' }, step: 'overview' },
      }
    case 'c-grid':
      return { ...base, items: mixed, initial: { step: 'grid' } }
    case 'c-dismissed':
      return {
        ...base,
        items: mixed,
        initial: { filter: 'dismissed', step: 'dismissed' },
      }
    case 'c-confirm':
      return {
        ...base,
        items: mixed,
        initial: { sheet: { kind: 'confirmRest' }, step: 'grid' },
      }
    case 'c-icloud': {
      const cloud = mixed.find((i) => i.icloudOnly && i.status === 'found')
      return {
        ...base,
        items: mixed,
        initial: {
          sheet: { id: cloud?.id ?? '', kind: 'icloud' },
          step: 'grid',
        },
      }
    }
    case 'c-quick': {
      const first = mixed.find((i) => i.status === 'found' && !i.icloudOnly)
      return {
        ...base,
        items: mixed,
        initial: { quickId: first?.id ?? '', step: 'quick' },
      }
    }
    case 'c-series': {
      const anchor = mixed.find((i) => i.burstId !== null)
      return {
        ...base,
        items: mixed,
        initial: {
          quickId: anchor?.id ?? '',
          seriesId: anchor?.id ?? '',
          step: 'series',
        },
      }
    }
    case 'd-upload':
      return {
        ...base,
        items: mixed,
        initial: { step: 'upload' },
        snapshot: uploadSnapshot(mixed, 'running', 37),
      }
    case 'd-paused':
      return {
        ...base,
        items: mixed,
        initial: { step: 'upload' },
        snapshot: uploadSnapshot(mixed, 'paused', 37),
      }
    case 'd-done':
      return {
        ...base,
        items: mixed,
        initial: { step: 'done' },
        snapshot: uploadSnapshot(mixed, 'idle', 96),
      }
    case 'd-icloud':
      return {
        ...base,
        items: mixed,
        initial: { step: 'icloudWaiting' },
        snapshot: uploadSnapshot(mixed, 'idle', 82, true),
      }
    case 's-offline':
      return {
        ...base,
        items: mixed,
        initial: { step: 'upload' },
        online: false,
        snapshot: uploadSnapshot(mixed, 'waiting_online', 37),
      }
    case 's-resume':
      return {
        ...base,
        items: mixed,
        initial: { step: 'resume' },
        snapshot: uploadSnapshot(mixed, 'idle', 37),
      }
    case 's-empty':
      return { ...base, initial: { step: 'empty' } }
    case 's-error':
      return { ...base, initial: { step: 'error' }, listFails: true }
    default:
      return { ...base, initial: { step: 'select' } }
  }
}

export { DEMO_JOURNEY, triageItemId }
