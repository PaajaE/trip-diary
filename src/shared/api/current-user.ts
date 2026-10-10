import { getSupabaseClient } from '@/shared/api/supabase'

/** Id of the signed-in user (needed for created_by on inserts). */
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await getSupabaseClient().auth.getUser()
  if (error !== null) {
    throw error
  }
  if (user === null) {
    throw new Error('Sign in required')
  }
  return user.id
}
