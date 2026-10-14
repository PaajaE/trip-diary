import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithPassword = vi.fn()
const signUp = vi.fn()
const requestCaptchaToken = vi.fn()

vi.mock('@/shared/api/supabase', () => ({
  getSupabaseClient: () => ({ auth: { signInWithPassword, signUp } }),
}))
vi.mock('@/features/auth/api/turnstile', () => ({ requestCaptchaToken }))

const { signIn, signUp: signUpService } =
  await import('@/features/auth/api/auth.service')

const user = { id: 'u1' }

beforeEach(() => {
  vi.clearAllMocks()
  signInWithPassword.mockResolvedValue({ data: { user }, error: null })
  signUp.mockResolvedValue({ data: { session: null, user }, error: null })
})

describe('auth service captcha', () => {
  it('sends the captcha token with password sign-in', async () => {
    requestCaptchaToken.mockResolvedValue('tok')
    await signIn({ email: 'a@example.com', password: 'secret-pass-1' })
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'a@example.com',
      options: { captchaToken: 'tok' },
      password: 'secret-pass-1',
    })
  })

  it('sends no options without a site key', async () => {
    requestCaptchaToken.mockResolvedValue(undefined)
    await signIn({ email: 'a@example.com', password: 'secret-pass-1' })
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'secret-pass-1',
    })
  })

  it('sends the captcha token with sign-up', async () => {
    requestCaptchaToken.mockResolvedValue('tok')
    await signUpService({
      confirmPassword: 'secret-pass-1',
      email: 'a@example.com',
      password: 'secret-pass-1',
      username: 'pavel',
    })
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ captchaToken: 'tok' }),
      }),
    )
  })

  it('does not call Supabase when the captcha is cancelled', async () => {
    requestCaptchaToken.mockRejectedValue(new Error('cancelled'))
    await expect(
      signIn({ email: 'a@example.com', password: 'secret-pass-1' }),
    ).rejects.toThrow('cancelled')
    expect(signInWithPassword).not.toHaveBeenCalled()
  })
})
