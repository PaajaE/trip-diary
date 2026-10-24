import { publicEnv } from '@/shared/config/env'

/**
 * Entry points of the time/location correction are shown only with the build
 * flag on: the RPCs do not exist in production databases yet.
 */
export function isMediaCorrectionsEnabled(): boolean {
  return publicEnv.mediaCorrections === true
}
