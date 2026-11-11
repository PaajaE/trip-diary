import { useEffect, useState } from 'react'
import type { MediaItem } from '@/entities/media/model/media-library'
import type { WorkspaceEdits } from '@/features/journey-workspace/api/use-workspace-edits'
import { MediaViewer } from '@/features/journey-workspace/ui/MediaViewer'

const HUES = [205, 150, 30, 340, 95, 260, 180, 120]

function fakeItem(n: number): MediaItem {
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const hue = HUES[n % HUES.length] ?? 205
  return {
    altitude: null,
    caption: n === 7 ? 'Přehled od Bow Falls, ještě bez mraků.' : null,
    capturedAt: new Date(Date.UTC(2026, 7, 4, 20, n)).toISOString(),
    capturedTz: 'America/Edmonton',
    createdAt: '2026-11-10T09:00:00.000Z',
    device: null,
    durationMs: null,
    focalX: null,
    focalY: null,
    height: 1200,
    hideLocation: false,
    id,
    journeyId: null,
    kind: 'photo',
    latitude: 51.1784,
    longitude: -115.5708,
    momentId: null,
    ownerId: '00000000-0000-4000-8000-000000000999',
    segmentOverrideId: null,
    starred: n === 7,
    status: 'ready',
    updatedAt: '2026-11-10T09:00:00.000Z',
    variants: (['thumb', 'small', 'medium'] as const).map((kind) => ({
      byteSize: 1000,
      createdAt: '2026-11-10T09:00:00.000Z',
      height: 800,
      kind,
      mediaId: id,
      mimeType: 'image/webp' as const,
      storageKey: `h${String(hue)}.svg`,
      width: 600,
    })),
    width: 900,
  }
}

const EDITS = {
  saveCaption: () => Promise.resolve({ ok: true }),
  toggleStar: () => Promise.resolve(true),
} as unknown as WorkspaceEdits

/** Dev harness of the photo viewer's bottom panel (mockup V1/V2). */
export function ViewerHarness({ expanded }: { expanded: boolean }) {
  const [items] = useState(() =>
    Array.from({ length: 23 }, (_, i) => fakeItem(i + 1)),
  )
  useEffect(() => {
    if (!expanded) return
    const timer = window.setTimeout(() => {
      document
        .querySelector<HTMLButtonElement>(
          'button[aria-controls][aria-expanded="false"]',
        )
        ?.click()
    }, 150)
    return () => {
      window.clearTimeout(timer)
    }
  }, [expanded])
  return (
    <MediaViewer
      baseUrl={`${window.location.origin}/demo-media`}
      edits={EDITS}
      groups={[{ id: 'g', items, title: 'Bow Falls', tz: 'America/Edmonton' }]}
      locale="cs"
      onClose={() => undefined}
      onDelete={() => undefined}
      onExtractToMoment={() => undefined}
      onMoveToMoment={() => undefined}
      startId={items[6]?.id ?? ''}
      targets={new Map()}
    />
  )
}
