/**
 * Shared setup of the sorting screen tests (the screen on the fixture day
 * with fake actions). Each test file mocks the router and haptics itself.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
import { stopToConfirm } from '@/features/journey-flow/model/day-sort'
import type { FlowDay } from '@/features/journey-flow/model/flow-days'
import { fixtureDays } from '@/features/journey-flow/test-fixtures'
import {
  SortScreen,
  type SortScreenActions,
} from '@/features/journey-flow/ui/sort/SortScreen'

export function actionsMock() {
  return {
    createStopFromPhotos: vi.fn().mockResolvedValue('new-stop'),
    daySits: vi.fn().mockResolvedValue(true),
    finishStop: vi.fn(
      (
        stop: Parameters<SortScreenActions['finishStop']>[0],
        now: ReadonlySet<string>,
      ) => Promise.resolve(stopToConfirm(stop, now)),
    ),
    mergeWithPrevious: vi.fn().mockResolvedValue('merged'),
    movePhotos: vi.fn().mockResolvedValue(1),
    restorePhotos: vi.fn().mockResolvedValue(1),
    sortPhotos: vi.fn().mockResolvedValue(1),
    splitStop: vi.fn().mockResolvedValue('new'),
    starPhotos: vi.fn().mockResolvedValue(undefined),
    trashPhotos: vi.fn().mockResolvedValue(1),
  } satisfies SortScreenActions
}

export function setup(
  options: {
    mutate?: Parameters<typeof fixtureDays>[0]
    day?: (d: FlowDay) => FlowDay
  } = {},
) {
  const days = fixtureDays(options.mutate)
  const found = days[0]
  if (found === undefined) throw new Error('no day')
  const day = options.day === undefined ? found : options.day(found)
  const actions = actionsMock()
  const onOpenReview = vi.fn()
  render(
    <SortScreen
      actions={actions}
      baseUrl="https://m.test"
      day={day}
      days={days}
      journeyId="j1"
      moveStops={[]}
      onOpenReview={onOpenReview}
    />,
  )
  const idsOf = (stopId: string) =>
    day.stops.find((s) => s.id === stopId)?.media.map((m) => m.id) ?? []
  return { actions, day, idsOf, onOpenReview }
}

export const UNDO = /^Zpět\s?Z?$/
export const FULLSCREEN = 'Celá obrazovka, bez rušení (F)'
export const position = () => screen.getByTestId('sort-position').textContent
export const click = async (name: string | RegExp) => {
  await act(() => {
    fireEvent.click(screen.getByRole('button', { name }))
    return Promise.resolve()
  })
}
export const key = async (k: string, target: Element = document.body) => {
  await act(() => {
    fireEvent.keyDown(target, { key: k })
    return Promise.resolve()
  })
}
export const openStop = async (number: number) => {
  fireEvent.click(screen.getByTestId('sort-stop-toggle'))
  const panel = screen.getByTestId('sort-stop-panel')
  await act(() => {
    fireEvent.click(
      within(panel).getByRole('button', {
        name: new RegExp(`^${String(number)} · `),
      }),
    )
    return Promise.resolve()
  })
}
