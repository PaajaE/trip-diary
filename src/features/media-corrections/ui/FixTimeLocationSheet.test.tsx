import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type * as MediaLibraryModule from '@/entities/media/model/media-library'
import { med } from '@/features/journey-workspace/test-fixtures'
import { FixTimeLocationSheet } from '@/features/media-corrections/ui/FixTimeLocationSheet'
import { ToastContext, type ShowToastOptions } from '@/shared/ui/toast-context'

const repo = vi.hoisted(() => ({
  clearMediaLocation: vi.fn(() => Promise.resolve(1)),
  setMediaLocation: vi.fn(() => Promise.resolve(1)),
  shiftMediaTime: vi.fn(() => Promise.resolve(1)),
}))
const organize = vi.hoisted(() => ({
  organizeJourney: vi.fn(() => Promise.resolve({ counts: {}, ok: true })),
}))
vi.mock('@/entities/media/api/media-corrections.repository', () => repo)
// The real limit (366 days) would need 367 clicks, slow in a loaded CI: the
// exact boundary is covered by model/fix-time.test.ts; here a 3-day limit
// proves that the sheet reacts to it.
vi.mock('@/entities/media/model/media-library', async (importOriginal) => ({
  ...(await importOriginal<typeof MediaLibraryModule>()),
  MAX_SHIFT_SECONDS: 3 * 86_400,
}))
vi.mock('@/features/journey-organize/api/organize-journey', () => organize)
// No real map in tests: the stub picks Brno when its button is pressed.
vi.mock('@/features/media-corrections/ui/LocationPickerMap', () => ({
  LocationPickerMap: ({
    onPick,
    point,
  }: {
    onPick: (point: { latitude: number; longitude: number }) => void
    point: { latitude: number; longitude: number } | null
  }) => (
    <div data-testid="map-stub">
      <span data-testid="map-point">
        {point === null ? 'none' : String(point.latitude)}
      </span>
      <button
        type="button"
        onClick={() => {
          onPick({ latitude: 49.1951, longitude: 16.6068 })
        }}
      >
        stub-pick
      </button>
    </div>
  ),
}))

const a = med(1, { capturedAt: '2026-01-02T10:00:00+00:00' })
const b = med(2, { capturedAt: '2026-01-02T10:05:00+00:00' })
const bare = med(3, { capturedAt: null, capturedTz: null })

let toasts: ShowToastOptions[] = []
function renderSheet(items = [a, b], props: { onClose?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn()
  const client = new QueryClient()
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <ToastContext.Provider
        value={{
          showToast: (options) => {
            toasts.push(options)
          },
        }}
      >
        {children}
      </ToastContext.Provider>
    </QueryClientProvider>
  )
  render(
    <FixTimeLocationSheet items={items} journeyId="j" onClose={onClose} />,
    { wrapper },
  )
  return { onClose }
}

const click = (name: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name }))
}

beforeEach(async () => {
  vi.clearAllMocks()
  toasts = []
  await i18n.changeLanguage('en')
})
afterEach(cleanup)

describe('FixTimeLocationSheet', () => {
  it('is a labelled modal dialog with a subtitle and proper tabs', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Fix time and location' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('2 photos selected')).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Time', 'Location'])
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel')).toBeTruthy()
  })

  it('previews the first photo before and after in its own zone', () => {
    renderSheet()
    const preview = screen.getByTestId('fix-preview')
    // 10:00 UTC is 11:00 in Prague in January.
    expect(preview).toHaveTextContent(/11:00/)
    expect(screen.getByTestId('fix-after-time')).toHaveTextContent(/11:00/)
    click('+1 h')
    expect(screen.getByTestId('fix-after-time')).toHaveTextContent(/12:00/)
    expect(screen.getByTestId('fix-shift')).toHaveTextContent('+1 h 0 min')
    click('−30 min')
    expect(screen.getByTestId('fix-after-time')).toHaveTextContent(/11:30/)
  })

  it('steps hours and minutes with the stepper buttons', () => {
    renderSheet()
    click('One hour less')
    click('One minute less')
    expect(screen.getByTestId('fix-shift')).toHaveTextContent('−1 h 1 min')
    click('One hour more')
    click('One minute more')
    expect(screen.getByTestId('fix-shift')).toHaveTextContent('No change')
    click('Clock was a day ahead')
    expect(screen.getByTestId('fix-shift')).toHaveTextContent('−24 h 0 min')
    click('Reset')
    expect(screen.getByTestId('fix-shift')).toHaveTextContent('No change')
  })

  it('refuses a shift over the limit', () => {
    renderSheet()
    for (let i = 0; i < 3; i += 1) click('Clock was a day behind')
    expect(screen.queryByRole('alert')).toBeNull()
    const apply = screen.getByRole('button', { name: 'Fix 2 photos' })
    expect((apply as HTMLButtonElement).disabled).toBe(false)
    click('Clock was a day behind')
    expect(screen.getByRole('alert')).toHaveTextContent(/at most/)
    expect((apply as HTMLButtonElement).disabled).toBe(true)
  })

  it('cannot apply a zero shift or when no photo has a capture time', () => {
    renderSheet()
    expect(
      screen.getByRole('button', {
        name: 'Fix 2 photos',
      }),
    ).toBeDisabled()
    cleanup()
    renderSheet([bare])
    expect(screen.getByTestId('fix-no-time')).toBeTruthy()
    click('+1 h')
    expect(
      screen.getByRole('button', {
        name: 'Fix 0 photos',
      }),
    ).toBeDisabled()
  })

  it('applies the shift in seconds, toasts the count and undoes it inversely', async () => {
    const { onClose } = renderSheet([a, b, bare])
    click('+1 h')
    click('−30 min')
    // Only the two photos with a capture time change.
    fireEvent.click(screen.getByRole('button', { name: 'Fix 2 photos' }))
    await waitFor(() => {
      expect(repo.shiftMediaTime).toHaveBeenCalledWith(
        [a.id, b.id, bare.id],
        1800,
      )
    })
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(organize.organizeJourney).not.toHaveBeenCalled()
    const toast = toasts.find((entry) => entry.message === 'Fixed: 2')
    expect(toast?.action?.label).toBe('Undo')
    await act(async () => {
      toast?.action?.onClick()
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(repo.shiftMediaTime).toHaveBeenLastCalledWith(
        [a.id, b.id, bare.id],
        -1800,
      )
    })
  })

  it('re-sorts into stops after the shift only when the box is ticked', async () => {
    renderSheet()
    click('+1 h')
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /re-sort into stops \(locked and manual stay\)/,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Fix 2 photos' }))
    await waitFor(() => {
      expect(organize.organizeJourney).toHaveBeenCalledOnce()
    })
    expect(organize.organizeJourney).toHaveBeenCalledWith(
      'j',
      expect.objectContaining({ segmentTitle: expect.any(Function) }),
    )
    expect(repo.shiftMediaTime).toHaveBeenCalled()
  })

  it('keeps the sheet open and shows an error toast when the shift fails', async () => {
    const { onClose } = renderSheet()
    repo.shiftMediaTime.mockRejectedValueOnce(new Error('nope'))
    click('+1 h')
    fireEvent.click(screen.getByRole('button', { name: 'Fix 2 photos' }))
    await waitFor(() => {
      expect(toasts.some((entry) => entry.variant === 'error')).toBe(true)
    })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('sets the location from numeric inputs and undoes by previous coordinates', async () => {
    const prague = med(4, { latitude: 50.08, longitude: 14.42 })
    const prague2 = med(5, { latitude: 50.08, longitude: 14.42 })
    const none = med(6)
    renderSheet([prague, prague2, none])
    fireEvent.click(screen.getByRole('tab', { name: 'Location' }))
    const apply = screen.getByRole('button', { name: 'Fix 3 photos' })
    expect((apply as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Latitude'), {
      target: { value: '49,5' },
    })
    fireEvent.change(screen.getByLabelText('Longitude'), {
      target: { value: '17.25' },
    })
    expect(screen.getByTestId('fix-chosen')).toHaveTextContent(
      '49.500000, 17.250000',
    )
    // Not confirmed yet.
    expect((apply as HTMLButtonElement).disabled).toBe(true)
    click('Use this location')
    expect((apply as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(apply)
    await waitFor(() => {
      expect(repo.setMediaLocation).toHaveBeenCalledWith(
        [prague.id, prague2.id, none.id],
        49.5,
        17.25,
      )
    })
    const toast = toasts.find((entry) => entry.message === 'Fixed: 3')
    repo.setMediaLocation.mockClear()
    await act(async () => {
      toast?.action?.onClick()
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(repo.clearMediaLocation).toHaveBeenCalledWith([none.id])
      expect(repo.setMediaLocation).toHaveBeenCalledWith(
        [prague.id, prague2.id],
        50.08,
        14.42,
      )
    })
  })

  it('rejects invalid coordinates and takes a point from the map', async () => {
    renderSheet()
    fireEvent.click(screen.getByRole('tab', { name: 'Location' }))
    fireEvent.change(screen.getByLabelText('Latitude'), {
      target: { value: '95' },
    })
    fireEvent.change(screen.getByLabelText('Longitude'), {
      target: { value: '10' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent('latitude from')
    expect(
      screen.getByRole('button', {
        name: 'Use this location',
      }),
    ).toBeDisabled()
    fireEvent.click(await screen.findByRole('button', { name: 'stub-pick' }))
    expect(screen.getByLabelText('Latitude')).toHaveValue('49.195100')
    expect(screen.getByTestId('map-point')).toHaveTextContent('49.1951')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('closes on Escape, the backdrop and Cancel', () => {
    const { onClose } = renderSheet()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('fix-sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(2)
    click('Cancel')
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('does not let keys reach a viewer listening on the document', () => {
    renderSheet()
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
  })

  it('moves between tabs with the arrow keys', () => {
    renderSheet()
    const [time, location] = screen.getAllByRole('tab')
    time?.focus()
    fireEvent.keyDown(time!, { key: 'ArrowRight' })
    expect(location?.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(location)
    fireEvent.keyDown(location!, { key: 'ArrowLeft' })
    expect(time?.getAttribute('aria-selected')).toBe('true')
  })

  it('returns focus to the opener on unmount', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    renderSheet()
    cleanup()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
