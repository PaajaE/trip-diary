import {
  currentProfileSchema,
  type CurrentProfile,
} from '@/entities/profile/model/profile'
import { localDb } from '@/shared/lib/local-db'

const profileCacheKey = (userId: string) => `trip-diary:profile:${userId}`

export async function saveCachedProfile(
  profile: CurrentProfile,
): Promise<void> {
  const parsed = currentProfileSchema.parse(profile)
  await localDb.cachedProfiles.put({
    cachedAt: new Date().toISOString(),
    profile: parsed,
    userId: parsed.id,
  })

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(profileCacheKey(parsed.id), JSON.stringify(parsed))
  }
}

export async function getCachedProfile(
  userId: string,
): Promise<CurrentProfile | null> {
  const cached = await localDb.cachedProfiles.get(userId)
  if (cached !== undefined) {
    return currentProfileSchema.parse(cached.profile)
  }

  if (typeof sessionStorage === 'undefined') {
    return null
  }

  const raw = sessionStorage.getItem(profileCacheKey(userId))
  if (raw === null) {
    return null
  }

  const profile = currentProfileSchema.parse(JSON.parse(raw))
  await saveCachedProfile(profile)
  return profile
}
