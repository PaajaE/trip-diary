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

/**
 * Returns a captcha token, or `undefined` when no site key is configured (local
 * dev). The script is loaded on the first call only. The managed widget is shown
 * in a small overlay so a visitor can solve a challenge if Cloudflare asks for it.
 */
export async function requestCaptchaToken(
  siteKey: string | undefined = publicEnv.turnstileSiteKey,
): Promise<string | undefined> {
  if (siteKey === undefined) return undefined
  const turnstile = await loadScript()
  return new Promise<string>((resolve, reject) => {
    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.className =
      'fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4'
    const box = document.createElement('div')
    box.className = 'rounded-lg bg-background p-4'
    overlay.append(box)
    document.body.append(overlay)
    let widgetId: string | null = null
    const done = () => {
      if (widgetId !== null) turnstile.remove(widgetId)
      overlay.remove()
    }
    widgetId = turnstile.render(box, {
      callback: (token) => {
        done()
        resolve(token)
      },
      'error-callback': () => {
        done()
        reject(new Error('Turnstile challenge failed'))
      },
      'expired-callback': () => {
        done()
        reject(new Error('Turnstile token expired'))
      },
      sitekey: siteKey,
    })
  })
}
