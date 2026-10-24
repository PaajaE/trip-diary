import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/app/i18n'
import { QuickNotePage } from '@/features/quick-note/ui/QuickNotePage'

const J = '11111111-1111-4111-8111-111111111111'
const saveQuickNote = vi.fn()
let canLocate = true
let native = true

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('@/features/auth/session/use-session', () => ({
  useSession: () => ({ user: { id: 'u1' } }),
}))
vi.mock('@/features/quick-note/api/save-quick-note', () => ({
  saveQuickNote: (...args: unknown[]) => saveQuickNote(...args) as unknown,
}))
vi.mock('@/shared/lib/geolocation', () => ({
  isGeolocationAvailable: () => canLocate,
}))

function renderPage(startVoice = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QuickNotePage journeyId={J} startVoice={startVoice} />
    </QueryClientProvider>,
  )
}

class FakeRecognition {
  static instances: FakeRecognition[] = []
  continuous = false
  interimResults = false
  lang = ''
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onresult: ((event: unknown) => void) | null = null
  aborted = false
  started = false
  constructor() {
    FakeRecognition.instances.push(this)
  }
  abort() {
    this.aborted = true
  }
  start() {
    this.started = true
  }
  stop() {
    this.onend?.()
  }
  say(parts: { final: boolean; text: string }[]) {
    this.onresult?.({
      results: parts.map((part) => ({
        0: { transcript: part.text },
        isFinal: part.final,
        length: 1,
      })),
    })
  }
}
const speechHost = window as unknown as {
  SpeechRecognition?: unknown
  webkitSpeechRecognition?: unknown
}

function installRecognizer() {
  speechHost.webkitSpeechRecognition = FakeRecognition
}

afterEach(() => {
  delete speechHost.webkitSpeechRecognition
  delete speechHost.SpeechRecognition
  FakeRecognition.instances = []
  native = true
  cleanup()
  localStorage.clear()
  saveQuickNote.mockReset()
  canLocate = true
})

const textareaValue = () => {
  const node = screen.getByLabelText('Co se právě děje?')
  return node instanceof HTMLTextAreaElement ? node.value : null
}

const type = (value: string) => {
  fireEvent.change(screen.getByLabelText('Co se právě děje?'), {
    target: { value },
  })
}

describe('QuickNotePage', () => {
  it('saves the text with location on by default, then clears it and the draft', async () => {
    saveQuickNote.mockResolvedValue({ located: true, ok: true })
    renderPage()
    type('Medvěd u cesty')
    expect(localStorage.getItem(`trip-diary.quick-note.${J}`)).toBe(
      'Medvěd u cesty',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Uložit zápis' }))
    await screen.findByText(/Zápis uložen i s polohou/)
    expect(saveQuickNote).toHaveBeenCalledWith({
      journeyId: J,
      text: 'Medvěd u cesty',
      useLocation: true,
      userId: 'u1',
    })
    expect(textareaValue()).toBe('')
    expect(localStorage.getItem(`trip-diary.quick-note.${J}`)).toBeNull()
  })

  it('keeps the text and says so when saving fails', async () => {
    saveQuickNote.mockResolvedValue({ ok: false, reason: 'save_failed' })
    renderPage()
    type('Důležité')
    fireEvent.click(screen.getByRole('button', { name: 'Uložit zápis' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Text zůstal zachován',
    )
    expect(textareaValue()).toBe('Důležité')
  })

  it('restores the draft and respects the location toggle', async () => {
    localStorage.setItem(`trip-diary.quick-note.${J}`, 'Rozepsáno')
    saveQuickNote.mockResolvedValue({ located: false, ok: true })
    renderPage()
    expect(textareaValue()).toBe('Rozepsáno')
    fireEvent.click(screen.getByLabelText('Přidat moji polohu'))
    fireEvent.click(screen.getByRole('button', { name: 'Uložit zápis' }))
    await waitFor(() => {
      expect(saveQuickNote).toHaveBeenCalledWith(
        expect.objectContaining({ useLocation: false }),
      )
    })
  })

  it('hides the location option when it is unavailable and explains an empty note', async () => {
    canLocate = false
    saveQuickNote.mockResolvedValue({ ok: false, reason: 'empty' })
    renderPage()
    expect(screen.queryByLabelText('Přidat moji polohu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Uložit zápis' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      'alespoň pár slov',
    )
  })

  describe('dictation', () => {
    it('hides the button when there is no recognizer', () => {
      renderPage()
      expect(screen.queryByRole('button', { name: 'Nadiktovat' })).toBeNull()
    })

    it('hides the button on the web when the recognizer cannot run locally', () => {
      native = false
      installRecognizer()
      renderPage()
      expect(screen.queryByRole('button', { name: 'Nadiktovat' })).toBeNull()
    })

    it('offers it on the web when the recognizer can run locally', () => {
      native = false
      Object.defineProperty(FakeRecognition.prototype, 'processLocally', {
        configurable: true,
        value: false,
        writable: true,
      })
      installRecognizer()
      renderPage()
      expect(screen.getByRole('button', { name: 'Nadiktovat' })).toBeTruthy()
      Reflect.deleteProperty(FakeRecognition.prototype, 'processLocally')
    })

    it('appends interim and final speech to the text and shows the listening state', () => {
      vi.useFakeTimers()
      installRecognizer()
      renderPage()
      type('Ráno')
      fireEvent.click(screen.getByRole('button', { name: 'Nadiktovat' }))
      const recognition = FakeRecognition.instances[0]
      expect(recognition?.started).toBe(true)
      expect(recognition?.lang).toBe('cs-CZ')
      expect(screen.getByTestId('dictation-listening').textContent).toContain(
        '0:00',
      )
      act(() => {
        recognition?.say([{ final: false, text: 'jsme vyrazili' }])
      })
      expect(textareaValue()).toBe('Ráno jsme vyrazili')
      act(() => {
        recognition?.say([
          { final: true, text: 'jsme vyrazili' },
          { final: false, text: ' na túru' },
        ])
        vi.advanceTimersByTime(3000)
      })
      expect(textareaValue()).toBe('Ráno jsme vyrazili na túru')
      expect(screen.getByTestId('dictation-listening').textContent).toContain(
        '0:03',
      )
      expect(localStorage.getItem(`trip-diary.quick-note.${J}`)).toBe(
        'Ráno jsme vyrazili na túru',
      )
      fireEvent.click(screen.getByRole('button', { name: 'Zastavit' }))
      expect(screen.queryByTestId('dictation-listening')).toBeNull()
      expect(screen.getByRole('button', { name: 'Nadiktovat' })).toBeTruthy()
      vi.useRealTimers()
    })

    it('starts immediately with the voice flag and stops on unmount', () => {
      installRecognizer()
      renderPage(true)
      const recognition = FakeRecognition.instances[0]
      expect(recognition?.started).toBe(true)
      expect(screen.getByTestId('dictation-listening')).toBeTruthy()
      cleanup()
      expect(recognition?.aborted).toBe(true)
    })

    it('says so briefly when permission is denied', () => {
      installRecognizer()
      renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Nadiktovat' }))
      act(() => {
        FakeRecognition.instances[0]?.onerror?.({ error: 'not-allowed' })
        FakeRecognition.instances[0]?.onend?.()
      })
      expect(screen.getByRole('alert').textContent).toContain(
        'Rozpoznávání řeči není povolené',
      )
      expect(screen.getByRole('button', { name: 'Nadiktovat' })).toBeTruthy()
    })
  })
})
