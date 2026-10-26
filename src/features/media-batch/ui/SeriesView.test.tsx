import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import { med } from '@/features/journey-workspace/test-fixtures'
import { SeriesView } from '@/features/media-batch/ui/SeriesView'

const p1 = med(1, {
  capturedAt: '2026-01-02T09:00:00+00:00',
  quality: { eyesClosed: true, sharp: 10, v: 1 },
})
const p2 = med(2, {
  capturedAt: '2026-01-02T09:00:05+00:00',
  quality: { eyesClosed: false, sharp: 40, v: 1 },
})
const p3 = med(3, { capturedAt: '2026-01-02T09:00:09+00:00' })

function setup(items = [p1, p2, p3]) {
  const props = {
    onClose: vi.fn(),
    onKeep: vi.fn(),
    onStar: vi.fn(),
    onTrash: vi.fn(),
    onUndo: vi.fn(),
  }
  render(
    <SeriesView baseUrl="https://m.test" canUndo items={items} {...props} />,
  )
  return props
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

describe('SeriesView', () => {
  it('is a dialog that recommends the best with reason chips', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Pick the best one' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const chips = screen.getByTestId('series-chips')
    expect(within(chips).getByText('Recommended')).toBeTruthy()
    expect(within(chips).getByText('Sharpest of the series')).toBeTruthy()
    expect(within(chips).getByText('Eyes open')).toBeTruthy()
  })

  it('shows sharpness only relative to the series, never absolute', () => {
    setup()
    const meters = screen.getAllByRole('meter')
    expect(meters).toHaveLength(2) // p3 has no quality
    expect(meters.map((m) => m.getAttribute('aria-valuenow'))).toEqual([
      '25',
      '100',
    ])
    expect(screen.queryByText(/blurry|sharp:/i)).toBeNull()
  })

  it('degrades without any quality data: no meters, no reason chips', () => {
    setup([med(1), med(2)])
    expect(screen.queryAllByRole('meter')).toHaveLength(0)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('keeps the recommended one and trashes the others', () => {
    const { onKeep } = setup()
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep this one, trash the other 2' }),
    )
    expect(onKeep).toHaveBeenCalledWith([p2.id], [p1.id, p3.id])
  })

  it('tapping a thumbnail makes it the main one', () => {
    const { onKeep } = setup()
    fireEvent.click(
      screen.getByRole('button', { name: 'Photo 1 of the series' }),
    )
    expect(
      screen
        .getByRole('button', { name: 'Photo 1 of the series' })
        .getAttribute('data-selected'),
    ).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /^Keep this one/ }))
    expect(onKeep).toHaveBeenCalledWith([p1.id], [p2.id, p3.id])
  })

  it('keeps several and trashes the unselected', () => {
    const { onKeep } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keep more than one' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Photo 3 of the series' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep selected (2), trash the rest' }),
    )
    expect(onKeep).toHaveBeenCalledWith([p2.id, p3.id], [p1.id])
  })

  it('compare shows two large images and zoom keeps both visible', () => {
    setup([
      { ...p1, variants: [variant(p1.id)] },
      { ...p2, variants: [variant(p2.id)] },
    ])
    const stage = screen.getByTestId('series-stage')
    expect(stage.querySelectorAll('img')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))
    expect(stage.querySelectorAll('img')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom' }))
    expect(stage.querySelectorAll('img')).toHaveLength(2)
    expect(
      within(stage)
        .getAllByTestId('compare-pane')
        .map((pane) => pane.getAttribute('data-zoom')),
    ).toEqual(['2.000', '2.000'])
    fireEvent.keyDown(document.body, { key: 'Escape' })
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(within(stage).getAllByTestId('compare-pane')).toHaveLength(1)
  })

  it('trash and star act on the compared photo B', () => {
    const { onStar, onTrash, onClose } = setup()
    fireEvent.keyDown(document.body, { key: 'c' })
    fireEvent.click(screen.getByRole('button', { name: 'Trash photo B' }))
    expect(onTrash).toHaveBeenCalledWith(expect.objectContaining({ id: p3.id }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark photo B as best' }),
    )
    expect(onStar).toHaveBeenCalledWith(expect.objectContaining({ id: p3.id }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeping B selects it without making it the main photo', () => {
    const { onKeep } = setup()
    fireEvent.keyDown(document.body, { key: 'c' })
    fireEvent.click(screen.getByRole('button', { name: 'Keep photo B' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Keep selected (1), trash the rest' }),
    )
    expect(onKeep).toHaveBeenCalledWith([p3.id], [p1.id, p2.id])
  })

  it('keep all, close and Escape close; undo is wired', () => {
    const { onClose, onUndo } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Keep all' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })
})

function variant(mediaId: string) {
  return {
    byteSize: 10,
    createdAt: '2026-01-01T00:00:00+00:00',
    height: 100,
    kind: 'large' as const,
    mediaId,
    mimeType: 'image/webp' as const,
    storageKey: `k/${mediaId}`,
    width: 100,
  }
}
