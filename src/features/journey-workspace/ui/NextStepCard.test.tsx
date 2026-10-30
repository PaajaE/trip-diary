import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { NextStepCard } from '@/features/journey-workspace/ui/NextStepCard'

describe('NextStepCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('cs')
  })
  afterEach(cleanup)

  it('offers one step with a rough time and starts it', () => {
    const onStart = vi.fn()
    const step = {
      count: 340,
      id: 'unreviewed' as const,
      minutes: 17,
      shortMinutes: 2,
    }
    render(<NextStepCard step={step} onStart={onStart} />)
    expect(screen.getByText('Roztřídit 340 fotek')).toBeTruthy()
    expect(screen.getByText('asi 17 min')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Začít' }))
    expect(onStart).toHaveBeenCalledWith(step)
  })

  it('says thanks, without a button, when nothing waits', () => {
    render(<NextStepCard step={null} onStart={vi.fn()} />)
    expect(screen.getByTestId('next-step-done')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers accepting all suggestions and a short version', () => {
    const onAcceptAll = vi.fn()
    const onStart = vi.fn()
    const step = {
      count: 4,
      id: 'suggestions' as const,
      minutes: 1,
      shortMinutes: 1,
    }
    render(
      <NextStepCard step={step} onAcceptAll={onAcceptAll} onStart={onStart} />,
    )
    fireEvent.click(screen.getByTestId('next-step-accept-all'))
    expect(onAcceptAll).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('next-step-short'))
    expect(onStart).toHaveBeenCalledWith(step)
  })
})
