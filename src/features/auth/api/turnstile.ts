import i18next from 'i18next'
import { publicEnv } from '@/shared/config/env'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'

interface TurnstileApi {
  remove: (widgetId: string) => void
  render: (
    container: HTMLElement,
    options: {
      callback: (token: string) => void
      'error-callback': () => void
      'expired-callback': () => void
      sitekey: string
      theme?: 'auto' | 'dark' | 'light'
    },
  ) => string
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${SCRIPT_SRC}?render=explicit`
    script.async = true
    script.onload = () => {
      if (window.turnstile === undefined) {
        reject(new Error('Turnstile did not initialise'))
      } else {
        resolve(window.turnstile)
      }
    }
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Turnstile failed to load'))
    }
    document.head.append(script)
  })
  return scriptPromise
}

export type CaptchaFailureReason = 'cancelled' | 'error' | 'expired' | 'timeout'

/** Typed captcha failure so callers can show a friendly message and retry. */
export class CaptchaError extends Error {
  readonly reason: CaptchaFailureReason

  constructor(reason: CaptchaFailureReason) {
    super(`captcha:${reason}`)
    this.name = 'CaptchaError'
    this.reason = reason
  }
}

export const CAPTCHA_TIMEOUT_MS = 90_000

let warnedMissingKey = false

function warnMissingKeyOnce(): void {
  if (warnedMissingKey || !import.meta.env.PROD) return
  warnedMissingKey = true
  console.warn(
    'VITE_TURNSTILE_SITE_KEY is not set: guest sign-in runs without a captcha token.',
  )
}

/**
 * Returns a captcha token, or `undefined` when no site key is configured (local
 * dev). The script is loaded on the first call only. The managed widget is shown
 * in a small overlay so a visitor can solve a challenge if Cloudflare asks for it.
 * The promise always settles: it rejects with `CaptchaError` on widget error,
 * expiry, the visitor closing the overlay, or after `timeoutMs`.
 */
export async function requestCaptchaToken(
  siteKey: string | undefined = publicEnv.turnstileSiteKey,
  timeoutMs: number = CAPTCHA_TIMEOUT_MS,
): Promise<string | undefined> {
  if (siteKey === undefined) {
    warnMissingKeyOnce()
    return undefined
  }
  const turnstile = await loadScript()
  return new Promise<string>((resolve, reject) => {
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-labelledby', 'captcha-title')
    overlay.className =
      'fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 opacity-0 backdrop-blur-sm transition-opacity duration-200'
    const box = document.createElement('div')
    box.className =
      'flex w-full max-w-[22rem] translate-y-2 flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-6 text-center shadow-2xl transition-transform duration-200'
    const title = document.createElement('h2')
    title.id = 'captcha-title'
    title.className = 'text-lg font-semibold'
    title.textContent = i18next.t('auth.captcha.title', {
      defaultValue: 'Quick security check',
    })
    const hint = document.createElement('p')
    hint.className = 'text-sm leading-6 text-muted'
    hint.textContent = i18next.t('auth.captcha.hint', {
      defaultValue: 'We just need to confirm you are not a robot.',
    })
    // The widget is 300x65. The slot reserves that size up front, with a
    // placeholder behind it, so the dialog does not jump when the widget loads.
    const slot = document.createElement('div')
    slot.className =
      'relative flex h-[65px] w-[300px] max-w-full items-center justify-center overflow-hidden rounded-md bg-background'
    const placeholder = document.createElement('div')
    placeholder.className =
      'absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted'
    const spinner = document.createElement('span')
    spinner.className =
      'h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary'
    spinner.setAttribute('aria-hidden', 'true')
    const loadingLabel = document.createElement('span')
    loadingLabel.textContent = i18next.t('common.loading', {
      defaultValue: 'Loading…',
    })
    placeholder.append(spinner, loadingLabel)
    const widgetHost = document.createElement('div')
    widgetHost.className = 'relative'
    slot.append(placeholder, widgetHost)
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className =
      'min-h-11 rounded-md px-4 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline'
    cancel.textContent = i18next.t('common.cancel', { defaultValue: 'Cancel' })
    box.append(title, hint, slot, cancel)
    overlay.append(box)
    document.body.append(overlay)
    requestAnimationFrame(() => {
      overlay.classList.replace('opacity-0', 'opacity-100')
      box.classList.replace('translate-y-2', 'translate-y-0')
    })
    let widgetId: string | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let settled = false
    const finish = (settle: () => void) => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      if (widgetId !== null) turnstile.remove(widgetId)
      overlay.remove()
      settle()
    }
    const fail = (reason: CaptchaFailureReason) => {
      finish(() => {
        reject(new CaptchaError(reason))
      })
    }
    cancel.addEventListener('click', () => {
      fail('cancelled')
    })
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) fail('cancelled')
    })
    timer = setTimeout(() => {
      fail('timeout')
    }, timeoutMs)
    try {
      widgetId = turnstile.render(widgetHost, {
        callback: (token) => {
          finish(() => {
            resolve(token)
          })
        },
        'error-callback': () => {
          fail('error')
        },
        'expired-callback': () => {
          fail('expired')
        },
        sitekey: siteKey,
        theme: 'auto',
      })
    } catch {
      fail('error')
    }
  })
}
