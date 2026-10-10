import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { QueueSnapshot } from '@/features/media-import/api/upload-queue'
import type { UploadJob } from '@/entities/media/model/upload-job'
import { ImportPage } from '@/features/media-import/ui/ImportPage'

const queue = vi.hoisted(() => ({
  cancel: vi.fn(() => Promise.resolve()),
  enqueue: vi.fn(() => Promise.resolve({ enqueued: 1, known: 0, skipped: 0 })),
  pause: vi.fn(() => Promise.resolve()),
  resume: vi.fn(() => Promise.resolve()),
  retryFailed: vi.fn(() => Promise.resolve()),
  start: vi.fn(),
}))
const setSource = vi.hoisted(() => vi.fn())
const state = vi.hoisted(() => ({
  native: false,
  snapshot: null as unknown as QueueSnapshot,
}))
const getCursor = vi.hoisted(() => vi.fn())
const photoKitList = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => (
    <a href="/import">{children}</a>
  ),
}))
vi.mock('@/features/auth/session/use-session', () => ({
  useSession: () => ({ user: { id: 'owner-1' } }),
}))
vi.mock('@/features/media-import/api/use-import-queue', () => ({
  useImportQueue: () => ({ queue, setSource, snapshot: state.snapshot }),
}))
vi.mock('@/entities/media/api/upload-jobs.store', () => ({
  dexieUploadJobStore: { getCursor },
}))
vi.mock('@/features/journey-organize/ui/OrganizeJourneyButton', () => ({
  OrganizeJourneyButton: () => (
    <button type="button">Organize automatically</button>
  ),
}))
vi.mock('@/shared/lib/media-library', () => ({
  getMediaLibraryStatus: () => Promise.resolve('authorized'),
  isMediaLibraryAvailable: () => state.native,
  requestMediaLibraryAccess: () => Promise.resolve('authorized'),
}))
vi.mock('@/features/media-import/api/photokit-source', () => ({
  createPhotoKitSource: () => ({
    kind: 'photokit',
    list: photoKitList,
    open: vi.fn(),
  }),
}))

function job(over: Partial<UploadJob>): UploadJob {
  return {
    attempts: 0,
    byteSize: null,
    capturedAt: null,
    createdAt: 'x',
    durationMs: null,
    id: `j|web-files|${over.sourceId ?? 'a.jpg|1|2'}`,
    journeyId: 'j',
    latitude: null,
    longitude: null,
    mediaType: 'photo',
    ownerId: 'owner-1',
    sourceId: 'a.jpg|1|2',
    sourceKind: 'web-files',
    state: 'pending',
    updatedAt: 'x',
    ...over,
  }
}

function snapshot(
  jobs: UploadJob[],
  runtime: QueueSnapshot['runtime'] = 'idle',
  current: QueueSnapshot['current'] = null,
): QueueSnapshot {
  const counts = {
    done: 0,
    failed: 0,
    paused: 0,
    pending: 0,
    processing: 0,
    skipped: 0,
  }
  for (const item of jobs) counts[item.state] += 1
  return { counts, current, jobs, runtime }
}

beforeEach(async () => {
  vi.clearAllMocks()
  state.native = false
  state.snapshot = snapshot([])
  getCursor.mockResolvedValue(null)
  await i18n.changeLanguage('en')
})
afterEach(() => {
  cleanup()
})

describe('ImportPage', () => {
  it('on the web offers a file picker restricted to the supported types and no iCloud toggle', () => {
    render(<ImportPage journeyId="j" />)
    const input = document.querySelector('input[type="file"]')
    expect(input?.getAttribute('accept')).toBe(
      'image/jpeg,image/png,image/webp,video/mp4',
    )
    expect(input?.hasAttribute('multiple')).toBe(true)
    expect(screen.queryByText('Download originals from iCloud')).toBeNull()
  })

  it('summarizes picked files, explains skips and enqueues on start', async () => {
    render(<ImportPage journeyId="j" />)
    const input = document.querySelector('input[type="file"]')
    if (input === null) throw new Error('no input')
    fireEvent.change(input, {
      target: {
        files: [
          new File(['x'], 'a.jpg', { type: 'image/jpeg' }),
          new File(['x'], 'b.heic', { type: 'image/heic' }),
          new File(['x'], 'c.mp4', { type: 'video/mp4' }),
        ],
      },
    })
    expect(await screen.findByText('Photos: 1')).toBeTruthy()
    expect(screen.getByText('Videos: 0')).toBeTruthy()
    expect(screen.getByText('Skipped: 2')).toBeTruthy()
    expect(screen.getByText(/HEIC\/HEIF photos are not supported/)).toBeTruthy()
    expect(
      screen.getByText(/Videos cannot be imported in the browser/),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Start import' }))
    await waitFor(() => {
      expect(queue.start).toHaveBeenCalled()
    })
    expect(queue.enqueue).toHaveBeenCalledWith(
      'web-files',
      expect.arrayContaining([expect.objectContaining({ mediaType: 'photo' })]),
    )
  })

  it('renders counters, the current phase, waiting-for-network and the problem list', () => {
    state.snapshot = snapshot(
      [
        job({ sourceId: 'p1|1|2', state: 'done' }),
        job({ sourceId: 'p2|1|2', state: 'pending' }),
        job({ sourceId: 'p3|1|2', state: 'processing' }),
        job({
          lastError: 'duplicate',
          sourceId: 'p4.jpg|1|2',
          state: 'skipped',
        }),
        job({
          lastError: 'processing_failed',
          mediaType: 'video',
          sourceId: 'p5.mp4|1|2',
          state: 'failed',
        }),
      ],
      'waiting_online',
      { fraction: 0.5, jobId: 'x', phase: 'uploading', sourceId: 'p3|1|2' },
    )
    render(<ImportPage journeyId="j" />)
    expect(screen.getByText('Done: 1')).toBeTruthy()
    expect(screen.getByText('Waiting: 1')).toBeTruthy()
    expect(screen.getByText('In progress: 1')).toBeTruthy()
    expect(screen.getByText('Skipped: 1')).toBeTruthy()
    expect(screen.getByText('Failed: 1')).toBeTruthy()
    expect(screen.getByText('Now: uploading (50 %)')).toBeTruthy()
    expect(screen.getByText(/Waiting for a connection/)).toBeTruthy()
    expect(screen.getByText('Photo p4.jpg')).toBeTruthy()
    expect(screen.getByText('Video p5.mp4')).toBeTruthy()
    expect(screen.getByText('Already imported.')).toBeTruthy()
    expect(screen.getByText('The file could not be read.')).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: 'Organize automatically' }),
    ).toBeNull()
  })

  it('wires pause, resume, retry failed and cancel', () => {
    state.snapshot = snapshot(
      [
        job({ sourceId: 'a|1|2', state: 'paused' }),
        job({
          lastError: 'processing_failed',
          sourceId: 'b|1|2',
          state: 'failed',
        }),
      ],
      'paused',
    )
    render(<ImportPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop and clear the waiting items' }),
    )
    expect(queue.resume).toHaveBeenCalled()
    expect(queue.retryFailed).toHaveBeenCalled()
    expect(queue.cancel).toHaveBeenCalled()
  })

  it('offers pause while running', () => {
    state.snapshot = snapshot([job({ state: 'processing' })], 'running')
    render(<ImportPage journeyId="j" />)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(queue.pause).toHaveBeenCalled()
  })

  it('offers to organize automatically when the import is finished', () => {
    state.snapshot = snapshot(
      [
        job({ sourceId: 'a|1|2', state: 'done' }),
        job({ sourceId: 'b|1|2', state: 'done' }),
      ],
      'idle',
    )
    render(<ImportPage journeyId="j" />)
    expect(screen.getByText('Import finished: 2 imported.')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Organize automatically' }),
    ).toBeTruthy()
  })

  describe('native photo library', () => {
    beforeEach(() => {
      state.native = true
    })

    it('shows the iCloud toggle (off) with the data warning and scans with the chosen range', async () => {
      getCursor.mockResolvedValue({
        journeyId: 'j',
        key: 'j|photokit',
        lastCapturedAt: '2026-09-11T10:00:00.000Z',
        sourceKind: 'photokit',
        updatedAt: 'x',
      })
      photoKitList.mockResolvedValue([
        {
          capturedAt: '2026-09-12T10:00:00.000Z',
          durationMs: null,
          latitude: null,
          longitude: null,
          mediaType: 'photo',
          sourceId: 'A',
        },
      ])
      render(<ImportPage journeyId="j" />)
      const toggle = screen.getByRole('checkbox', {
        name: 'Download originals from iCloud',
      })
      expect(toggle).not.toBeChecked()
      expect(
        screen.getByText(/can take a long time and uses mobile data/),
      ).toBeTruthy()

      // "Since last import" becomes the default once a cursor exists.
      const since = await screen.findByRole('radio', {
        name: /Everything since the last import/,
      })
      await waitFor(() => {
        expect(since).toBeChecked()
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'Scan the photo library' }),
      )
      expect(await screen.findByText('Photos: 1')).toBeTruthy()
      expect(photoKitList).toHaveBeenCalledWith({
        from: '2026-09-11T10:00:00.001Z',
      })
    })

    it('has a date range with two date inputs', async () => {
      photoKitList.mockResolvedValue([])
      render(<ImportPage journeyId="j" />)
      fireEvent.click(screen.getByRole('radio', { name: 'Date range' }))
      fireEvent.change(screen.getByLabelText('From'), {
        target: { value: '2026-09-11' },
      })
      fireEvent.change(screen.getByLabelText('To'), {
        target: { value: '2026-09-11' },
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'Scan the photo library' }),
      )
      await waitFor(() => {
        expect(photoKitList).toHaveBeenCalled()
      })
      const range = photoKitList.mock.calls[0]?.[0] as {
        from: string
        to: string
      }
      // The device calendar day, expressed as instants (one day apart or 23-25 h).
      const hours = (Date.parse(range.to) - Date.parse(range.from)) / 3_600_000
      expect(hours).toBeGreaterThanOrEqual(23)
      expect(hours).toBeLessThanOrEqual(25)
    })
  })
})
