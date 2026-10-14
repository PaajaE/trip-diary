import type { User } from '@supabase/supabase-js'
import { requestCaptchaToken } from '@/features/auth/api/turnstile'
import { getSupabaseClient } from '@/shared/api/supabase'

export interface GuestSessionOptions {
  /** Returns a captcha token, or undefined when captcha is not configured. */
  getCaptchaToken?: () => Promise<string | undefined>
}

let inflight: Promise<User> | null = null

/**
 * Returns the current user, creating an anonymous (guest) Supabase session when
 * there is none. Call it only from a user action (heart, comment), never on page
 * load: it may load Turnstile and creates an auth user.
 */
export function ensureGuestSession(
  options: GuestSessionOptions = {},
): Promise<User> {
  inflight ??= createSession(options).finally(() => {
    inflight = null
  })
  return inflight
}

async function createSession({
  getCaptchaToken = requestCaptchaToken,
}: GuestSessionOptions): Promise<User> {
  const client = getSupabaseClient()
  const { data: current, error: sessionError } = await client.auth.getSession()
  if (sessionError !== null) throw sessionError
  if (current.session !== null) return current.session.user

  const captchaToken = await getCaptchaToken()
  const { data, error } = await client.auth.signInAnonymously(
    captchaToken === undefined ? undefined : { options: { captchaToken } },
  )
  if (error !== null) throw error
  if (data.user === null) throw new Error('Anonymous sign-in returned no user')
  return data.user
}

export function isGuestUser(user: User | null): boolean {
  return user?.is_anonymous === true
}
