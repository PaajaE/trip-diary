import { deriveStopNames, type StopName } from '@trip-diary/core/automation'
import i18n from 'i18next'
import { describe, expect, it } from 'vitest'
import '@/app/i18n'
import { stopNameText } from './moment-labels'

function text(name: StopName | undefined, locale: string): string {
  if (name === undefined) throw new Error('missing name')
  return stopNameText(name, i18n.t.bind(i18n), locale).text
}

describe('stopNameText', () => {
  const names = deriveStopNames([
    {
      id: 'm',
      place: { kind: 'settlement', name: 'Banff' },
      placePending: false,
      startsAt: '2026-09-03T15:00:00Z',
      timeZone: 'America/Edmonton',
      title: null,
    },
    {
      id: 'a',
      place: { kind: 'settlement', name: 'Banff' },
      placePending: false,
      startsAt: '2026-09-03T21:00:00Z',
      timeZone: 'America/Edmonton',
      title: null,
    },
    {
      id: 'near',
      place: { name: 'u Canmore' },
      placePending: false,
      startsAt: '2026-09-04T21:00:00Z',
      timeZone: 'America/Edmonton',
      title: null,
    },
    {
      id: 'time',
      place: null,
      placePending: false,
      startsAt: '2026-09-03T21:30:00Z',
      timeZone: 'America/Edmonton',
      title: null,
    },
    {
      id: 'wait',
      place: null,
      placePending: true,
      startsAt: '2026-09-03T21:30:00Z',
      timeZone: 'America/Edmonton',
      title: null,
    },
  ])

  it('formats names in Czech', async () => {
    await i18n.changeLanguage('cs')
    expect(text(names.get('m'), 'cs')).toBe('Banff · ráno')
    expect(text(names.get('a'), 'cs')).toBe('Banff · odpoledne')
    expect(text(names.get('near'), 'cs')).toBe('u města Canmore')
    expect(text(names.get('time'), 'cs')).toBe('čtvrtek odpoledne')
    const pending = names.get('wait')
    expect(
      pending === undefined
        ? null
        : stopNameText(pending, i18n.t.bind(i18n), 'cs'),
    ).toEqual({ pending: true, text: 'Hledám místo…' })
  })

  it('formats names in English', async () => {
    await i18n.changeLanguage('en')
    expect(text(names.get('m'), 'en')).toBe('Banff · morning')
    expect(text(names.get('near'), 'en')).toBe('near Canmore')
    expect(text(names.get('time'), 'en')).toBe('Thursday afternoon')
    await i18n.changeLanguage('cs')
  })
})
