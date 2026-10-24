import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { OfflineBanner } from '@/shared/ui/OfflineBanner'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

describe('OfflineBanner', () => {
  afterEach(() => {
    cleanup()
    setOnline(true)
    vi.restoreAllMocks()
  })

  it('is hidden online and follows offline/online events', () => {
    setOnline(true)
    render(<OfflineBanner />)
    expect(screen.queryByTestId('offline-banner')).toBeNull()
    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('offline-banner').textContent).toContain(
      'Pracuješ offline, nic se neztratí',
    )
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByTestId('offline-banner')).toBeNull()
  })
})
