import { profileSchema, type Profile } from '@/entities/profile/model/profile'
import { getSupabaseClient } from '@/shared/api/supabase'

export async function loadCurrentProfile(
  userId: string,
): Promise<Profile | null> {
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .eq('id', userId)
    .maybeSingle()

  if (error !== null) {
    throw error
  }

  if (data === null) {
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
