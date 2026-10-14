import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CAPTCHA_TIMEOUT_MS,
  CaptchaError,
  requestCaptchaToken,
} from '@/features/auth/api/turnstile'

interface Options {
  callback: (token: string) => void
  'error-callback': () => void
  'expired-callback': () => void
}

let options: Options
const remove = vi.fn()

/** Starts a request; `outcome` never rejects (resolves to token or error). */
async function start(): Promise<{ outcome: Promise<unknown> }> {
  window.turnstile = {
    remove,
    render: (_c, o) => {
      options = o
      return 'w1'
    },
  }
  const outcome = requestCaptchaToken('site', CAPTCHA_TIMEOUT_MS).catch(
    (e: unknown) => e,
  )
  // loadScript appends a script tag; simulate it loading.
  document.head.querySelector('script')?.onload?.(new Event('load'))
  await vi.advanceTimersByTimeAsync(0)
  return { outcome }
}

describe('requestCaptchaToken', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    remove.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('resolves undefined without a site key', async () => {
    await expect(requestCaptchaToken(undefined)).resolves.toBeUndefined()
  })

  it('rejects with timeout after 90 s and removes the overlay', async () => {
    const { outcome } = await start()
    await vi.advanceTimersByTimeAsync(CAPTCHA_TIMEOUT_MS)
    const error = await outcome
    expect(error).toBeInstanceOf(CaptchaError)
    expect((error as CaptchaError).reason).toBe('timeout')
    expect(remove).toHaveBeenCalledWith('w1')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('rejects when the visitor cancels the overlay', async () => {
    const { outcome } = await start()
    document.querySelector('button')?.click()
    expect(((await outcome) as CaptchaError).reason).toBe('cancelled')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('rejects on widget error and expiry', async () => {
    const first = await start()
    options['error-callback']()
    expect(((await first.outcome) as CaptchaError).reason).toBe('error')
    const second = await start()
    options['expired-callback']()
    expect(((await second.outcome) as CaptchaError).reason).toBe('expired')
  })

  it('resolves with the token and ignores later timeout', async () => {
    const { outcome } = await start()
    options.callback('tok')
    expect(await outcome).toBe('tok')
    await vi.advanceTimersByTimeAsync(CAPTCHA_TIMEOUT_MS)
  })
})
