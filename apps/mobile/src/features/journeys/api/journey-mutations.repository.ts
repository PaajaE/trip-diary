import { createPublicSlug } from '@trip-diary/utils'
import { createUuid } from '@/platform/id'
import { getSupabaseClient, isSupabaseConfigured } from '@/platform/supabase'

export class JourneyMutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JourneyMutationError'
  }
}

export interface CreateJourneyRemoteInput {
  creatorId: string
  endsAt?: string | null
  spaceId: string
  startsAt?: string | null
  summary?: string
  title: string
}

function requireClient() {
  if (!isSupabaseConfigured()) {
    throw new JourneyMutationError('Supabase is not configured.')
  }

  return getSupabaseClient()
}

export async function createJourneyRemote(
  input: CreateJourneyRemoteInput,
): Promise<string> {
  const title = input.title.trim()
  if (title.length === 0) {
    throw new JourneyMutationError('Journey title is required.')
  }

  const id = createUuid()
  const startsAt = normalizeOptionalDate(input.startsAt)
  const endsAt = normalizeOptionalDate(input.endsAt)

  if (startsAt !== null && endsAt !== null && endsAt < startsAt) {
    throw new JourneyMutationError('End date must not be before start date.')
  }

  const { error } = await requireClient()
    .from('journeys')
    .insert({
      creator_id: input.creatorId,
      ends_at: endsAt,
      id,
      slug: createPublicSlug(title, id),
      space_id: input.spaceId,
      starts_at: startsAt,
      summary: input.summary?.trim() ?? '',
      title,
      visibility: 'public',
    })

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }

  return id
}

export async function updateJourneyRemote(
  journeyId: string,
  input: { summary: string; title: string },
): Promise<void> {
  const { error } = await requireClient()
    .from('journeys')
    .update({ summary: input.summary, title: input.title })
    .eq('id', journeyId)

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}

export async function deleteJourneyRemote(journeyId: string): Promise<void> {
  const { error } = await requireClient()
    .from('journeys')
    .delete()
    .eq('id', journeyId)

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}

function normalizeOptionalDate(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export async function addJourneyStageRemote(
  journeyId: string,
  title: string,
  summary = '',
): Promise<void> {
  const { error } = await requireClient().rpc('create_journey_stage', {
    p_journey_id: journeyId,
    p_summary: summary,
    p_title: title,
  })

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}

export async function updateJourneyStageRemote(
  stageId: string,
  input: { summary: string; title: string },
): Promise<void> {
  const { error } = await requireClient()
    .from('journey_stages')
    .update({ summary: input.summary, title: input.title })
    .eq('id', stageId)

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}

export async function deleteJourneyStageRemote(stageId: string): Promise<void> {
  const { error } = await requireClient()
    .from('journey_stages')
    .delete()
    .eq('id', stageId)

  if (error !== null) {
    throw new JourneyMutationError(error.message)
  }
}
