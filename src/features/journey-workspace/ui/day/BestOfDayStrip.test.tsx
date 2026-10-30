import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { med } from '@/features/journey-workspace/test-fixtures'
import { BestOfDayStrip } from '@/features/journey-workspace/ui/day/BestOfDayStrip'

describe('BestOfDayStrip', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('cs')
  })
  afterEach(cleanup)

  it('marks only the photos that are not starred yet', () => {
    const picks = [med(1), { ...med(2), starred: true }, med(3)]
    const onMarkAll = vi.fn()
    render(
      <BestOfDayStrip
        baseUrl="https://media.test"
        picks={picks}
        onMarkAll={onMarkAll}
        onOpen={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByTestId('best-of-day-mark'))
    expect(onMarkAll).toHaveBeenCalledWith([picks[0], picks[2]])
  })
  it('shows nothing without picks and a note when all are marked', () => {
    const { container, rerender } = render(
      <BestOfDayStrip
        baseUrl=""
        picks={[]}
        onMarkAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    )
    expect(container.textContent).toBe('')
    rerender(
      <BestOfDayStrip
        baseUrl=""
        picks={[{ ...med(1), starred: true }]}
        onMarkAll={vi.fn()}
        onOpen={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('best-of-day-mark')).toBeNull()
    expect(screen.getByText('Nejlepší fotky dne jsou označené.')).toBeTruthy()
  })
})
