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
import { buildFlowDays } from '@/features/journey-flow/model/flow-days'
import { EMPTY_MARKERS } from '@/features/journey-flow/model/flow-markers'
import { fixtureDay } from '@/features/journey-flow/test-fixtures'
import { IntakeScreen } from '@/features/journey-flow/ui/IntakeScreen'
import type { UndoOrganizeHandle } from '@/features/journey-organize/api/use-undo-organize'
import type { AutoOrganizeState } from '@/features/journey-organize/model/auto-organize'

vi.mock('@tanstack/react-router', async () => {
  const { MockLink } = await import('@/features/journey-workspace/test-router')
  return { Link: MockLink }
})

const IDLE: AutoOrganizeState = {
  exclusive: false,
  queued: false,
  status: 'idle',
}

function undoHandle(
  over: Partial<UndoOrganizeHandle> = {},
): UndoOrganizeHandle {
  return {
    available: true,
    result: null,
    running: false,
    undo: vi.fn().mockResolvedValue({ kind: 'nothing' }),
    ...over,
  }
}

function renderIntake(
  over: {
    auto?: AutoOrganizeState
    onRetryAuto?: () => void
    undo?: UndoOrganizeHandle
  } = {},
) {
  const { placeNames, tree } = fixtureDay()
  const flow = buildFlowDays({
    homeTz: 'UTC',
    markers: EMPTY_MARKERS,
    placeNames,
    tree,
  })
  return render(
    <IntakeScreen
      auto={over.auto ?? IDLE}
      flow={flow}
      journeyId="j1"
      markers={EMPTY_MARKERS}
      undo={over.undo ?? undoHandle()}
      {...(over.onRetryAuto === undefined
        ? {}
        : { onRetryAuto: over.onRetryAuto })}
    />,
  )
}

describe('IntakeScreen (Příjem)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('cs')
  })
  afterEach(cleanup)

  it('lists the new day with plain facts and a link to review it', () => {
    renderIntake()
    const day = screen.getByRole('article', { name: /5\. června/ })
    expect(within(day).getByText(/4 zastávky/)).toBeInTheDocument()
    expect(
      within(day).getByText(/\d+ si zaslouží pohled|Nic nápadného/),
    ).toBeInTheDocument()
    const link = within(day).getByRole('link', { name: /Projít den/ })
    expect(link).toHaveAttribute('href', '/j/j1/flow/2026-06-05')
    expect(screen.queryByText(/jistý den/i)).toBeNull()
    expect(screen.getByText(/bez data/)).toBeInTheDocument()
  })

  it('shows the undo banner and asks before undoing', async () => {
    const undo = undoHandle()
    renderIntake({ undo })
    expect(screen.getByText('Uspořádáno automaticky')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vrátit uspořádání' }))
    const dialog = screen.getByRole('dialog', { name: 'Vrátit uspořádání?' })
    expect(undo.undo).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zrušit' }))
    expect(undo.undo).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Vrátit uspořádání' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Vrátit uspořádání',
      }),
    )
    expect(undo.undo).toHaveBeenCalledTimes(1)
  })

  it('reports how many edited things the undo left alone', () => {
    renderIntake({
      undo: undoHandle({
        available: false,
        result: {
          counts: {
            mediaRestored: 0,
            momentsDeleted: 1,
            momentsRecreated: 0,
            momentsReverted: 0,
            segmentsDeleted: 0,
            segmentsRecreated: 0,
          },
          kind: 'done',
          skipped: [
            { id: 'a', reason: 'locked', target: 'moment' },
            { id: 'b', reason: 'changed', target: 'media' },
          ],
        },
      }),
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Uspořádání je vrácené. 2 věci, které jsi mezitím upravil, zůstaly, jak jsou.',
    )
    expect(
      screen.queryByRole('button', { name: 'Vrátit uspořádání' }),
    ).toBeNull()
  })

  it('shows the running state without an undo button while organizing', () => {
    renderIntake({
      auto: { exclusive: false, queued: false, status: 'running' },
      undo: undoHandle({ available: false }),
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Uspořádávám nové fotky…',
    )
    expect(
      screen.queryByRole('button', { name: 'Vrátit uspořádání' }),
    ).toBeNull()
  })

  it('shows an error of the automatic run with a retry', () => {
    const onRetryAuto = vi.fn()
    renderIntake({
      auto: {
        counts: {
          mediaReassigned: 0,
          momentsCreated: 0,
          momentsDeleted: 0,
          momentsExtended: 0,
          momentsUpdated: 0,
          segmentsDeleted: 0,
          stagesCreated: 0,
          tripsCreated: 0,
        },
        error: new Error('x'),
        exclusive: false,
        queued: false,
        retryCount: 3,
        runSeq: 1,
        status: 'error',
      },
      onRetryAuto,
      undo: undoHandle({ available: false }),
    })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Automatické uspořádání se zastavilo',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Zkusit uspořádat znovu' }),
    )
    expect(onRetryAuto).toHaveBeenCalledTimes(1)
  })
})
