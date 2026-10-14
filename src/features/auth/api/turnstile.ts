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
    overlay.className =
      'fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4'
    const box = document.createElement('div')
    box.className = 'flex flex-col items-end gap-2 rounded-lg bg-background p-4'
    const widgetHost = document.createElement('div')
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'text-sm underline'
    cancel.textContent = i18next.t('common.cancel', { defaultValue: 'Cancel' })
    box.append(widgetHost, cancel)
    overlay.append(box)
    document.body.append(overlay)
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
      })
    } catch {
      fail('error')
    }
  })
}
