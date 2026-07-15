import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorFallback } from '@/app/AppErrorFallback'
import { RootErrorBoundary } from '@/app/RootErrorBoundary'
import '@/app/i18n'

function ThrowingChild(): never {
  throw new Error('Test render failure')
}

function OkChild() {
  return <div>All good</div>
}

describe('RootErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders children when there is no error', () => {
    render(
      <RootErrorBoundary>
        <OkChild />
      </RootErrorBoundary>,
    )

    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('renders localized fallback after a render error', () => {
    render(
      <RootErrorBoundary>
        <ThrowingChild />
      </RootErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Něco se nepovedlo')).toBeInTheDocument()
    expect(
      within(alert).getByText('Aplikace narazila na neočekávaný problém.'),
    ).toBeInTheDocument()
  })

  it('reloads the application when recovery is clicked', async () => {
    const reload = vi.fn()
    const originalLocation = window.location

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
      writable: true,
    })

    render(
      <RootErrorBoundary>
        <ThrowingChild />
      </RootErrorBoundary>,
    )

    await userEvent.click(
      within(screen.getByRole('alert')).getByRole('button', {
        name: 'Obnovit aplikaci',
      }),
    )

    expect(reload).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
  })
})

describe('AppErrorFallback', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows development diagnostics when enabled', () => {
    render(
      <AppErrorFallback
        error={new Error('Test render failure')}
        onReload={vi.fn()}
        showDevDetails
      />,
    )

    expect(
      screen.getByText('Podrobnosti chyby (pouze ve vývoji)'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Test render failure/)).toBeInTheDocument()
  })

  it('hides error details when development diagnostics are disabled', () => {
    render(
      <AppErrorFallback
        error={new Error('Test render failure')}
        onReload={vi.fn()}
        showDevDetails={false}
      />,
    )

    expect(
      screen.queryByText('Podrobnosti chyby (pouze ve vývoji)'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Test render failure/)).not.toBeInTheDocument()
  })
})
