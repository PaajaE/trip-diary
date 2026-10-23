import { describe, expect, it } from 'vitest'
import {
  buildJourneyModel,
  type JourneyModel,
} from '@/entities/public-journey/lib/journey-model'
import {
  FIXTURE_IDS,
  publicJourneyFixture,
} from '@/entities/public-journey/lib/public-journey.fixture'
import {
  firstSentence,
  publicMomentTitle,
} from '@/features/public-journey/lib/moment-title'

const t = ((key: string, options?: { time?: string }) =>
  `${key}:${options?.time ?? ''}`) as never

function withMoment(
  patch: Partial<(typeof publicJourneyFixture.moments)[number]>,
): [JourneyModel, (typeof publicJourneyFixture.moments)[number]] {
  const base = publicJourneyFixture.moments.find(
    (m) => m.id === FIXTURE_IDS.momentB,
  )
  if (base === undefined) throw new Error('fixture moment missing')
  const moment = { ...base, ...patch }
  return [buildJourneyModel(publicJourneyFixture), moment]
}

describe('publicMomentTitle', () => {
  it('prefers the title', () => {
    const [model, moment] = withMoment({ title: '  Louka  ' })
    expect(publicMomentTitle(model, moment, t, 'cs')).toBe('Louka')
  })

  it('falls back to the first sentence of the text', () => {
    const [model, moment] = withMoment({
      body: 'Zastavili jsme se u jezera. Pak jsme šli dál.',
      title: null,
    })
    expect(publicMomentTitle(model, moment, t, 'cs')).toBe(
      'Zastavili jsme se u jezera',
    )
  })

  it('then to the place name', () => {
    const [model, moment] = withMoment({
      body: '',
      placeId: publicJourneyFixture.places[0]?.id ?? null,
      title: '',
    })
    expect(publicMomentTitle(model, moment, t, 'cs')).toBe('Assiniboine')
  })

  it('finally to a timed stop label, never a bare "Moment"', () => {
    const [model, moment] = withMoment({
      body: ' ',
      placeId: null,
      title: null,
    })
    expect(publicMomentTitle(model, moment, t, 'cs')).toMatch(
      /^publicJourney\.untitledMoment:\d{2}:\d{2}$/,
    )
  })
})

describe('firstSentence', () => {
  it('shortens long sentences', () => {
    expect(firstSentence('a'.repeat(100)).length).toBe(60)
  })
})
