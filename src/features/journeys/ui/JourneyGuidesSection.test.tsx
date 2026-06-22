import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addJourneyGuide } from '@/entities/journey/api/journey.repository'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { JourneyGuidesSection } from '@/features/journeys/ui/JourneyGuidesSection'
import '@/app/i18n'

vi.mock('@/entities/journey/api/journey.repository', () => ({
  addJourneyGuide: vi.fn(),
}))

function createJourney(guides: JourneyDetail['guides'] = []): JourneyDetail {
  return {
    endsAt: null,
    entries: [],
    guides,
    id: crypto.randomUUID(),
    stages: [],
    spaceId: crypto.randomUUID(),
    startsAt: null,
    status: 'planning',
    stops: [],
    summary: '',
    title: 'Test trip',
  }
}

describe('JourneyGuidesSection', () => {
  afterEach(() => {
    cleanup()
    vi.mocked(addJourneyGuide).mockReset()
  })

  it('lists guides and opens the add form', async () => {
    const user = userEvent.setup()
    const journey = createJourney([
      {
        body: 'Buy tickets online.',
        id: crypto.randomUUID(),
        title: 'Parking',
      },
    ])

    render(
      <JourneyGuidesSection
        canEdit
        creatorId={crypto.randomUUID()}
        journey={journey}
        onChanged={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Parking' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Přidat radu' }))
    expect(screen.getByLabelText('Název rady')).toBeVisible()
  })
})
