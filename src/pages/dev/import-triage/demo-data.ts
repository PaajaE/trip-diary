import {
  triageItemId,
  type TriageItem,
  type TriageStatus,
} from '@/entities/media/model/triage-item'
import type { ImportCandidate } from '@/features/media-import/model/types'

/** Dev-only demo library for the import flow harness (no real photos). */

export const DEMO_JOURNEY = 'demo-journey'
export const DEMO_OWNER = 'demo-owner'

const DAY_COUNTS = [41, 57, 38, 52, 30, 24, 36, 34, 18]
const DAY_PLACES = [
  'Calgary',
  'Banff',
  'Banff',
  'Lake Louise',
  'Jasper',
  'Jasper',
  'Kamloops',
  'Whistler',
  'Vancouver',
]
const HUES = [205, 150, 30, 340, 95, 260, 180, 120, 215, 300]

function lcg(seed: number): () => number {
  let x = seed
  return () => {
    x = (x * 48271) % 2147483647
    return x / 2147483647
  }
}

/** SVG stand-in for a photo (sky, hills, sun), like the mockup's colour cards. */
export function placeholderSvg(hue: number, variant: number): string {
  const sky = `hsl(${String(hue)} 46% 72%)`
  const ground = `hsl(${String(hue + 22)} 40% 40%)`
  const hill = `hsl(${String(hue + 8)} 34% 24%)`
  const sun = `hsl(${String(hue)} 85% 92%)`
  const shape =
    variant === 1
      ? `<rect x="0" y="58" width="100" height="42" fill="hsl(${String(hue + 30)} 45% 22%)"/>`
      : variant === 2
        ? `<rect x="6" y="50" width="14" height="50" fill="${hill}"/><rect x="24" y="44" width="20" height="56" fill="${hill}"/><rect x="48" y="50" width="22" height="50" fill="${hill}"/><rect x="74" y="46" width="20" height="54" fill="${hill}"/>`
        : `<polygon points="-8,100 14,40 30,68 50,8 70,60 86,28 108,100" fill="${hill}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${ground}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>${shape}<circle cx="82" cy="20" r="6" fill="${sun}"/></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function hueOf(sourceId: string): number {
  const n = Number(sourceId.split('-')[1] ?? '0')
  return HUES[n % HUES.length] ?? 205
}

export function variantOf(sourceId: string): number {
  return Number(sourceId.split('-')[1] ?? '0') % 3
}

export interface DemoOptions {
  /** Total number of library items. */
  total: number
}

/** Candidates of a demo library: 9 days (or 59 for the large one). */
export function demoCandidates({ total }: DemoOptions): ImportCandidate[] {
  const random = lcg(7)
  const days = total > 1000 ? 59 : 9
  const counts =
    total > 1000
      ? Array.from({ length: days }, (_, i) => 10 + ((i * 37) % 70))
      : DAY_COUNTS
  const scale = total / counts.reduce((a, b) => a + b, 0)
  const startDay = total > 1000 ? Date.UTC(2026, 5, 14) : Date.UTC(2026, 7, 3)
  const out: ImportCandidate[] = []
  let n = 0
  counts.forEach((count, dayIndex) => {
    const target = Math.round(count * scale)
    for (let i = 0; i < target && out.length < total; i += 1) {
      const minutes =
        8 * 60 + Math.round((i / target) * 600) + Math.floor(random() * 3)
      const at = new Date(
        startDay + dayIndex * 86_400_000 + (minutes + 360) * 60_000,
      )
      const noGps = n % 14 === 3 && n < 23 * 14 // ~23 without location
      const place = DAY_PLACES[dayIndex % DAY_PLACES.length] ?? null
      out.push({
        burstId:
          n % 40 >= 10 && n % 40 <= 13
            ? `burst-${String(Math.floor(n / 40))}`
            : null,
        byteSize: null,
        capturedAt: at.toISOString(),
        durationMs: n % 18 === 5 ? 24_000 : null,
        latitude: noGps ? null : 51.1 - dayIndex * 0.12 + random() * 0.05,
        longitude: noGps ? null : -114 - dayIndex * 0.6 + random() * 0.05,
        mediaType: n % 18 === 5 ? 'video' : 'photo',
        place,
        sourceId: `demo-${String(n)}`,
      })
      n += 1
    }
  })
  while (out.length < total) {
    const last = out.at(-1)
    if (last === undefined) break
    out.push({ ...last, sourceId: `demo-${String(n)}` })
    n += 1
  }
  return out
}

/** Whether the demo item is "only in iCloud" (no local preview). */
export function isDemoCloud(sourceId: string): boolean {
  const n = Number(sourceId.split('-')[1] ?? '-1')
  return n >= 0 && n < 330 && n % 23 === 4
}

export interface SeedOptions {
  /** Counts per status; the rest is `found`. */
  dismissedBefore?: number
  statuses?: Partial<Record<TriageStatus, number>>
  total: number
}

/** Stored items of a demo selection with the requested status mix. */
export function seedItems({
  dismissedBefore = 0,
  statuses = {},
  total,
}: SeedOptions): TriageItem[] {
  const candidates = demoCandidates({ total })
  const order = candidates.map((_, i) => i)
  const random = lcg(11)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = order[i]
    const b = order[j]
    if (a !== undefined && b !== undefined) {
      order[i] = b
      order[j] = a
    }
  }
  const plan: TriageStatus[] = []
  for (const status of ['kept', 'starred', 'dismissed', 'uploaded'] as const) {
    for (let i = 0; i < (statuses[status] ?? 0); i += 1) plan.push(status)
  }
  const assigned = new Map<number, TriageStatus>()
  plan.forEach((status, i) => {
    const index = order[i]
    if (index !== undefined) assigned.set(index, status)
  })
  const selectionId = '2026-11-10T09:00:00.000Z-seed'
  const items = candidates.map((candidate, index): TriageItem => {
    const cloud = isDemoCloud(candidate.sourceId)
    return {
      bestPending: false,
      burstId: candidate.burstId ?? null,
      byteSize: null,
      capturedAt: candidate.capturedAt,
      durationMs: candidate.durationMs,
      icloudOnly: cloud,
      id: triageItemId(DEMO_JOURNEY, 'photokit', candidate.sourceId),
      journeyId: DEMO_JOURNEY,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      mediaType: candidate.mediaType,
      ownerId: DEMO_OWNER,
      place: candidate.place ?? null,
      selectionId,
      sourceId: candidate.sourceId,
      sourceKind: 'photokit',
      status: assigned.get(index) ?? 'found',
      updatedAt: '2026-11-10T09:00:00.000Z',
    }
  })
  for (let i = 0; i < dismissedBefore; i += 1) {
    const base = items[i]
    if (base === undefined) break
    items.push({
      ...base,
      id: triageItemId(DEMO_JOURNEY, 'photokit', `old-${String(i)}`),
      selectionId: '2026-10-12T09:00:00.000Z-old',
      sourceId: `old-${String(i)}`,
      status: 'dismissed',
    })
  }
  return items
}
