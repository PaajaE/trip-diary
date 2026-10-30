import { z } from 'zod'
import { getSupabaseClient } from '@/shared/api/supabase'

export const PUBLISH_DELAY_OPTIONS = [0, 7, 14, 30, 90, 180, 365] as const

const publishingSchema = z.object({
  publish_delay_days: z.number().int().min(0).max(365),
  visibility: z.enum(['public', 'private']),
})

export interface JourneyPublishing {
  /** Moments readers may see / all moments (what is "in editing"). */
  momentCounts: { published: number; total: number }
  publishDelayDays: number
  visibility: 'private' | 'public'
}

function fail(error: { message: string }): never {
  throw new Error(error.message, { cause: error })
}

/** Reads the publishing switches of a journey and the published moment counts. */
export async function getJourneyPublishing(
  journeyId: string,
): Promise<JourneyPublishing | null> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('journeys')
    .select('visibility, publish_delay_days')
    .eq('id', journeyId)
    .maybeSingle()
  if (error !== null) fail(error)
  if (data === null) return null
  const row = publishingSchema.parse(data)
  const [total, published] = await Promise.all([
    client
      .from('moments')
      .select('id', { count: 'exact', head: true })
      .eq('journey_id', journeyId),
    client
      .from('moments')
      .select('id', { count: 'exact', head: true })
      .eq('journey_id', journeyId)
      .eq('published', true),
  ])
  if (total.error !== null) fail(total.error)
  if (published.error !== null) fail(published.error)
  return {
    momentCounts: { published: published.count ?? 0, total: total.count ?? 0 },
    publishDelayDays: row.publish_delay_days,
    visibility: row.visibility,
  }
}

/** Changes visibility and/or the delay; the database checks who may. */
export async function updateJourneyPublishing(
  journeyId: string,
  patch: { publishDelayDays?: number; visibility?: 'private' | 'public' },
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('journeys')
    .update({
      ...(patch.publishDelayDays === undefined
        ? {}
        : { publish_delay_days: patch.publishDelayDays }),
      ...(patch.visibility === undefined
        ? {}
        : { visibility: patch.visibility }),
    })
    .eq('id', journeyId)
  if (error !== null) fail(error)
}
