import {
  currentProfileSchema,
  type CurrentProfile,
} from '@/entities/profile/model/profile'

const profileCacheKey = (userId: string) => `trip-diary:profile:${userId}`

export function saveCachedProfile(profile: CurrentProfile): void {
  sessionStorage.setItem(
    profileCacheKey(profile.id),
    JSON.stringify(currentProfileSchema.parse(profile)),
  )
}

export function getCachedProfile(userId: string): CurrentProfile | null {
  const raw = sessionStorage.getItem(profileCacheKey(userId))
  if (raw === null) {
    return null
  }
  return currentProfileSchema.parse(JSON.parse(raw))
}
