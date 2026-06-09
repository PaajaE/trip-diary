import { profileSchema, type Profile } from '@/entities/profile/model/profile'
import { getSupabaseClient } from '@/shared/api/supabase'

export async function getPublicProfile(
  username: string,
): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .eq('username', username)
    .maybeSingle()

  if (error !== null) {
    throw error
  }

  if (data?.username === undefined || data.username === null) {
    return null
  }

  return profileSchema.parse({
    avatarUrl: data.avatar_url,
    bio: data.bio,
    displayName: data.display_name,
    id: data.id,
    username: data.username,
  })
}
