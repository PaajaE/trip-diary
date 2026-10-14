import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
const signInAnonymously = vi.fn()
vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ auth: { getSession, signInAnonymously } }),
}))

const { CaptchaError } = await import('@/features/auth/api/turnstile')
const { ensureGuestSession } = await import('@/features/auth/api/guest-session')

const user = { id: 'u1', is_anonymous: true }

describe('ensureGuestSession', () => {
  beforeEach(() => {
    getSession.mockReset()
    signInAnonymously.mockReset()
  })

  it('does nothing on import (no sign-in until called)', () => {
    expect(getSession).not.toHaveBeenCalled()
    expect(signInAnonymously).not.toHaveBeenCalled()
  })

  it('reuses an existing session without signing in or asking for a token', async () => {
    getSession.mockResolvedValue({ data: { session: { user } }, error: null })
    const getCaptchaToken = vi.fn()
    await expect(ensureGuestSession({ getCaptchaToken })).resolves.toBe(user)
    expect(signInAnonymously).not.toHaveBeenCalled()
    expect(getCaptchaToken).not.toHaveBeenCalled()
  })

  it('clears inflight when the captcha is cancelled so a retry works', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    signInAnonymously.mockResolvedValue({ data: { user }, error: null })
    await expect(
      ensureGuestSession({
        getCaptchaToken: () => Promise.reject(new CaptchaError('cancelled')),
      }),
    ).rejects.toBeInstanceOf(CaptchaError)
    await expect(
      ensureGuestSession({ getCaptchaToken: () => Promise.resolve('tok') }),
    ).resolves.toBe(user)
  })

  it('passes the captcha token to the anonymous sign-in', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    signInAnonymously.mockResolvedValue({ data: { user }, error: null })
    await ensureGuestSession({ getCaptchaToken: () => Promise.resolve('tok') })
    expect(signInAnonymously).toHaveBeenCalledWith({
      options: { captchaToken: 'tok' },
    })
  })

  it('sends no token when captcha is not configured', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    signInAnonymously.mockResolvedValue({ data: { user }, error: null })
    await ensureGuestSession({
      getCaptchaToken: () => Promise.resolve(undefined),
    })
    expect(signInAnonymously).toHaveBeenCalledWith(undefined)
  })

  it('shares one in-flight sign-in between concurrent calls', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    signInAnonymously.mockResolvedValue({ data: { user }, error: null })
    const opts = { getCaptchaToken: () => Promise.resolve(undefined) }
    await Promise.all([ensureGuestSession(opts), ensureGuestSession(opts)])
    expect(signInAnonymously).toHaveBeenCalledTimes(1)
  })

  it('propagates sign-in errors', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null })
    signInAnonymously.mockResolvedValue({
      data: { user: null },
      error: new Error('captcha'),
    })
    await expect(
      ensureGuestSession({ getCaptchaToken: () => Promise.resolve(undefined) }),
    ).rejects.toThrow('captcha')
  })
})
