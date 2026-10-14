import type { User } from '@supabase/supabase-js'
import { requestCaptchaToken } from '@/features/auth/api/turnstile'
import { getSupabaseClient } from '@/shared/api/supabase'
import {
  signInSchema,
  signUpSchema,
  type SignInInput,
  type SignUpInput,
} from '@/features/auth/model/auth.schemas'

export type AuthResult =
  | { status: 'authenticated'; user: User }
  | { status: 'confirmationRequired' }

/**
 * Supabase CAPTCHA protection covers every auth endpoint (sign-in, sign-up,
 * anonymous), so password flows need a token too. `undefined` means no site key
 * is configured (local dev), and then no token is sent.
 */
function captchaOptions(
  captchaToken: string | undefined,
): { captchaToken: string } | undefined {
  return captchaToken === undefined ? undefined : { captchaToken }
}

export async function signIn(input: SignInInput): Promise<AuthResult> {
  const credentials = signInSchema.parse(input)
  const captcha = captchaOptions(await requestCaptchaToken())
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    ...credentials,
    ...(captcha === undefined ? {} : { options: captcha }),
  })

  if (error !== null) {
    throw error
  }

  return { status: 'authenticated', user: data.user }
}

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const credentials = signUpSchema.parse(input)
  const captcha = captchaOptions(await requestCaptchaToken())
  const { data, error } = await getSupabaseClient().auth.signUp({
    email: credentials.email,
    options: {
      ...captcha,
      data: {
        username: credentials.username,
      },
    },
    password: credentials.password,
  })

  if (error !== null) {
    throw error
  }

  if (data.user === null) {
    throw new Error('Authentication succeeded without a user')
  }

  return data.session === null
    ? { status: 'confirmationRequired' }
    : { status: 'authenticated', user: data.user }
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut()

  if (error !== null) {
    throw error
  }
}
