import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import i18n from 'i18next'
import type { OrganizationPlan } from '@trip-diary/core/automation'
import { OrganizeJourneyButton } from '@/features/journey-organize/ui/OrganizeJourneyButton'

const preview = vi.fn()
const organizeNow = vi.fn()
vi.mock('@/features/journey-organize/api/organize-journey', () => ({
  previewOrganization: (...args: unknown[]) => preview(...args) as unknown,
}))
// The apply re-plans under the organizer (lock + snapshot), never the preview.
vi.mock('@/features/journey-organize/api/auto-organize', () => ({
  organizeNow: (...args: unknown[]) => organizeNow(...args) as unknown,
}))
const showToast = vi.fn()
vi.mock('@/shared/ui/use-toast', () => ({ useToast: () => ({ showToast }) }))

const plan: OrganizationPlan = {
  mediaReassignments: [{ mediaId: 'a', momentId: 'm1' }],
  momentsToCreate: [
    {
      endsAt: '2026-09-01T10:00:00.000Z',
      id: 'm1',
      kind: 'stay',
      latitude: null,
      longitude: null,
      mediaIds: ['a'],
      reason: 'stay: test',
      startsAt: '2026-09-01T09:00:00.000Z',
    },
  ],
  momentsToDelete: [],
  momentsToExtend: [],
  momentsToUpdate: [],
  segmentsToDelete: [],
  stageSuggestions: [],
  tripSuggestions: [
    {
      endsAt: '2026-09-02T10:00:00.000Z',
      id: 't1',
      kind: 'trip',
      position: 0,
      startsAt: '2026-09-02T09:00:00.000Z',
      title: 'Trip 1',
      tripType: 'day',
    },
  ],
}

function renderButton() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <OrganizeJourneyButton journeyId="j" />
    </QueryClientProvider>,
  )
}

describe('OrganizeJourneyButton', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18n.changeLanguage('en')
  })
  afterEach(() => {
    cleanup()
  })

  it('shows dry-run counts and the safety notes, and writes nothing before confirm', async () => {
    preview.mockResolvedValue(plan)
    renderButton()
    fireEvent.click(
      screen.getByRole('button', { name: 'Organize automatically' }),
    )
    expect(await screen.findByText('New stops: 1')).toBeTruthy()
    expect(screen.getByText('Stage and trip suggestions: 1')).toBeTruthy()
    expect(screen.getByText(/locked and hand-made stops/)).toBeTruthy()
    expect(screen.getByText(/Rejected suggestions will not/)).toBeTruthy()
    expect(organizeNow).not.toHaveBeenCalled()
  })

  it('re-plans through the organizer on confirm and reports the result', async () => {
    preview.mockResolvedValue(plan)
    organizeNow.mockResolvedValue({
      plan,
      result: {
        counts: {
          mediaReassigned: 1,
          momentsCreated: 1,
          momentsDeleted: 0,
          segmentsDeleted: 0,
          stagesCreated: 0,
          tripsCreated: 1,
        },
        ok: true,
      },
      unreadyIds: [],
    })
    renderButton()
    fireEvent.click(
      screen.getByRole('button', { name: 'Organize automatically' }),
    )
    await screen.findByText('New stops: 1')
    fireEvent.click(screen.getByRole('button', { name: 'Organize' }))
    await waitFor(() => {
      expect(organizeNow).toHaveBeenCalledWith('j', expect.anything())
    })
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith({
        message: 'Done: 1 new stops, 1 suggestions.',
      })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers no apply button when there is nothing to change', async () => {
    preview.mockResolvedValue({
      ...plan,
      mediaReassignments: [],
      momentsToCreate: [],
      tripSuggestions: [],
    })
    renderButton()
    fireEvent.click(
      screen.getByRole('button', { name: 'Organize automatically' }),
    )
    expect(await screen.findByText(/Nothing to change/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Organize' })).toBeNull()
  })

  it('says so when the fresh plan has nothing left to change', async () => {
    preview.mockResolvedValue(plan)
    organizeNow.mockResolvedValue({ plan, result: null, unreadyIds: [] })
    renderButton()
    fireEvent.click(
      screen.getByRole('button', { name: 'Organize automatically' }),
    )
    await screen.findByText('New stops: 1')
    fireEvent.click(screen.getByRole('button', { name: 'Organize' }))
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith({
        message: expect.stringMatching(/Nothing to change/) as string,
      })
    })
  })

  it('names the failed step in an error toast', async () => {
    preview.mockResolvedValue(plan)
    organizeNow.mockResolvedValue({
      plan,
      result: { counts: {}, error: { step: 'assignMedia' }, ok: false },
      unreadyIds: [],
    })
    renderButton()
    fireEvent.click(
      screen.getByRole('button', { name: 'Organize automatically' }),
    )
    await screen.findByText('New stops: 1')
    fireEvent.click(screen.getByRole('button', { name: 'Organize' }))
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith({
        message: expect.stringContaining('moving media') as string,
        variant: 'error',
      })
    })
  })
})
