import type { User } from '@supabase/supabase-js'
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

export async function signIn(input: SignInInput): Promise<AuthResult> {
  const credentials = signInSchema.parse(input)
  const { data, error } =
    await getSupabaseClient().auth.signInWithPassword(credentials)

  if (error !== null) {
    throw error
  }

  return { status: 'authenticated', user: data.user }
}

export async function signUp(input: SignUpInput): Promise<AuthResult> {
  const credentials = signUpSchema.parse(input)
  const { data, error } = await getSupabaseClient().auth.signUp({
    email: credentials.email,
    options: {
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
