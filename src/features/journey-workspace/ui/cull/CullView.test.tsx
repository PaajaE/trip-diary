import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaItem } from '@/entities/media/model/media-library'
import { med } from '@/features/journey-workspace/test-fixtures'
import { CullView } from '@/features/journey-workspace/ui/cull/CullView'

afterEach(cleanup)

const key = (k: string) => {
  fireEvent.keyDown(document.body, { key: k })
}

function setup(over: { restore?: boolean } = {}) {
  const items = [med(1), med(2), med(3), med(4)]
  const toggleStar = vi.fn()
  const trashMedia = vi.fn()
  const restoreMedia = vi.fn(() => Promise.resolve(true))
  const onClose = vi.fn()
  // Mimics the optimistic cache: star toggles, trash removes.
  function Host() {
    const [photos, setPhotos] = useState<MediaItem[]>(items)
    toggleStar.mockImplementation((item: MediaItem) => {
      setPhotos((list) =>
        list.map((p) => (p.id === item.id ? { ...p, starred: !p.starred } : p)),
      )
      return Promise.resolve(true)
    })
    trashMedia.mockImplementation((gone: MediaItem[]) => {
      setPhotos((list) => list.filter((p) => !gone.some((g) => g.id === p.id)))
      return Promise.resolve(true)
    })
    return (
      <CullView
        baseUrl="https://m.test"
        edits={{ toggleStar, trashMedia }}
        photos={photos}
        {...(over.restore === false ? {} : { restoreMedia })}
        onClose={onClose}
      />
    )
  }
  render(<Host />)
  return { items, onClose, restoreMedia, toggleStar, trashMedia }
}

describe('CullView', () => {
  it('stars and auto-advances', async () => {
    const { items, toggleStar } = setup()
    await act(async () => {
      key('s')
    })
    expect(toggleStar).toHaveBeenCalledWith(
      expect.objectContaining({ id: items[0]?.id }),
    )
    expect(
      screen
        .getAllByRole('button', { name: /cull.goTo/ })[1]
        ?.getAttribute('aria-current'),
    ).toBe('true')
  })

  it('trashes with X and Delete, skipping trashed on navigation', async () => {
    const { items, trashMedia } = setup()
    await act(async () => {
      key('x')
    })
    expect(trashMedia).toHaveBeenCalledWith([
      expect.objectContaining({ id: items[0]?.id }),
    ])
    await act(async () => {
      key('Delete')
    })
    expect(trashMedia).toHaveBeenCalledTimes(2)
    const strip = screen.getAllByRole('button', { name: /cull.goTo/ })
    expect(strip.map((b) => b.getAttribute('data-state'))).toEqual([
      'trashed',
      'trashed',
      'plain',
      'plain',
    ])
    key('ArrowLeft') // nothing earlier is visible
    expect(strip[2]?.getAttribute('aria-current')).toBe('true')
  })

  it('does not advance with auto-advance off', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /cull.autoAdvance/ }))
    await act(async () => {
      key('P')
    })
    expect(
      screen
        .getAllByRole('button', { name: /cull.goTo/ })[0]
        ?.getAttribute('aria-current'),
    ).toBe('true')
  })

  it('undoes a star and a trash with U', async () => {
    const { restoreMedia, toggleStar } = setup()
    await act(async () => {
      key('s')
    })
    await act(async () => {
      key('x')
    })
    await act(async () => {
      key('u')
    })
    expect(restoreMedia).toHaveBeenCalledTimes(1)
    await act(async () => {
      key('u')
    })
    expect(toggleStar).toHaveBeenCalledTimes(2)
    expect(
      screen
        .getByRole('button', { name: 'cull.undo' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('shows the filtered subset and the summary on exit', async () => {
    const { onClose } = setup()
    await act(async () => {
      key('s')
    })
    await act(async () => {
      key('x')
    })
    key('f')
    expect(screen.getAllByRole('button', { name: /cull.goTo/ })).toHaveLength(1)
    key('Escape')
    expect(screen.getByTestId('cull-summary').textContent).toContain(
      'cull.summary',
    )
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'cull.done' }))
    expect(onClose).toHaveBeenCalledWith({ starred: 1, trashed: 1 })
  })

  it('closes right away when nothing was done', () => {
    const { onClose } = setup()
    key('Escape')
    expect(onClose).toHaveBeenCalledWith({ starred: 0, trashed: 0 })
  })
})
