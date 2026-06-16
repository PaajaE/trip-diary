import { redirect } from '@tanstack/react-router'
import { storeAuthReturnPath } from '@/features/auth/session/auth-return'
import { getSupabaseClient } from '@/shared/api/supabase'

export async function requireAuth({
  location,
}: {
  location: { pathname: string; searchStr: string }
}): Promise<void> {
  let client: ReturnType<typeof getSupabaseClient>
  try {
    client = getSupabaseClient()
  } catch {
    storeAuthReturnPath(`${location.pathname}${location.searchStr}`)
    // TanStack Router uses thrown redirect objects instead of Error instances.
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- redirect helper
    throw redirect({ to: '/sign-in' })
  }

  const { data, error } = await client.auth.getSession()
  if (error !== null || data.session === null) {
    storeAuthReturnPath(`${location.pathname}${location.searchStr}`)
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- redirect helper
    throw redirect({ to: '/sign-in' })
  }
}
