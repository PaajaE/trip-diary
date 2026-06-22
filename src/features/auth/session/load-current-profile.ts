import {
  currentProfileSchema,
  type CurrentProfile,
} from '@/entities/profile/model/profile'
import {
  getCachedProfile,
  saveCachedProfile,
} from '@/entities/profile/api/local-profile-cache.repository'
import { getSupabaseClient } from '@/shared/api/supabase'
import { isBrowserOnline } from '@/shared/lib/network'

export async function loadCurrentProfile(
  userId: string,
): Promise<CurrentProfile | null> {
  if (!isBrowserOnline()) {
    return getCachedProfile(userId)
  }

  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, preferred_locale')
    .eq('id', userId)
    .maybeSingle()

  if (error !== null) {
    const cached = await getCachedProfile(userId)
    if (cached !== null) {
      return cached
    }
    throw error
  }

  if (data === null) {
    return null
  }

  const profile = currentProfileSchema.parse({
    avatarUrl: data.avatar_url,
    bio: data.bio,
    displayName: data.display_name,
    id: data.id,
    preferredLocale: data.preferred_locale,
    username: data.username,
  }) satisfies CurrentProfile

  await saveCachedProfile(profile)
  return profile
}
