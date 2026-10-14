import {
  parsePublicJourney,
  type PublicJourney,
} from '@trip-diary/core/public-journey'
import { getSupabaseClient } from '@/shared/api/supabase'

/**
 * Loads the whole public journey tree with ONE RPC call.
 * Resolves `null` when the journey is missing or not public.
 */
export async function getPublicJourneyTree(
  spaceHandle: string,
  journeySlug: string,
): Promise<PublicJourney | null> {
  const { data, error } = await getSupabaseClient().rpc('get_public_journey', {
    p_journey_slug: journeySlug,
    p_space_handle: spaceHandle,
  })
  if (error !== null) throw error
  return parsePublicJourney(data)
}
