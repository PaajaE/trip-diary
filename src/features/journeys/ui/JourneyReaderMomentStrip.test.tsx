import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import type { JourneyMoment } from '@/features/journeys/lib/journey-content'
import {
  getMomentExcerpt,
  handleStripKeyDown,
} from '@/features/journeys/ui/journey-reader-moment-strip.logic'
import { JourneyReaderMomentStrip } from '@/features/journeys/ui/JourneyReaderMomentStrip'

vi.mock('@/features/journeys/lib/use-journey-moment-photos', () => ({
  useJourneyMomentPhotos: () => ({
    isPending: false,
    photosByEntryId: new Map(),
  }),
}))

vi.mock('@/features/photos/lib/use-photo-object-urls', () => ({
  usePhotoObjectUrls: () => [],
}))

describe('JourneyReaderMomentStrip', () => {
  afterEach(() => {
    cleanup()
  })

  it('activates moments from keyboard navigation in newest-first order', () => {
    const moments = [
      createMoment('a', '2026-01-01T08:00:00.000Z'),
      createMoment('b', '2026-01-02T08:00:00.000Z'),
    ]
    const onActivateMoment = vi.fn()

    render(
      <JourneyReaderMomentStrip
        activeMomentId="b"
        moments={moments}
        onActivateMoment={onActivateMoment}
      />,
    )

    const listbox = screen.getByRole('listbox')
    fireEvent.keyDown(listbox, { key: 'ArrowRight' })

    expect(onActivateMoment).toHaveBeenCalledWith('a')
  })

  it('marks the active card with aria-selected', () => {
    const moments = [
      createMoment('a', '2026-01-01T08:00:00.000Z'),
      createMoment('b', '2026-01-02T08:00:00.000Z'),
    ]

    render(
      <JourneyReaderMomentStrip
        activeMomentId="b"
        moments={moments}
        onActivateMoment={vi.fn()}
      />,
    )

    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')
  })
})

describe('handleStripKeyDown', () => {
  it('moves to the first and last moments with Home and End', () => {
    const moments = [
      createMoment('a', '2026-01-01T08:00:00.000Z'),
      createMoment('b', '2026-01-02T08:00:00.000Z'),
      createMoment('c', '2026-01-03T08:00:00.000Z'),
    ]
    const onActivateMoment = vi.fn()

    handleStripKeyDown(
      {
        key: 'End',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent<HTMLDivElement>,
      moments,
      'a',
      onActivateMoment,
    )

    expect(onActivateMoment).toHaveBeenCalledWith('c')
  })
})

describe('getMomentExcerpt', () => {
  it('truncates long moment bodies', () => {
    expect(getMomentExcerpt('short body')).toBe('short body')
    expect(getMomentExcerpt('x'.repeat(120)).endsWith('…')).toBe(true)
  })
})

function createMoment(id: string, eventAt: string): JourneyMoment {
  return {
    entry: {
      body: 'Sample body',
      createdAt: eventAt,
      eventAt,
      id,
      slug: null,
      stageId: null,
      stopId: null,
      title: `Moment ${id}`,
      type: 'story',
    },
    location: null,
    stop: null,
  }
}
