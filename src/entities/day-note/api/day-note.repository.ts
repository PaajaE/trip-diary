import {
  DAY_NOTE_MAX_LENGTH,
  type DayNote,
  DayNoteError,
  dayNoteSchema,
} from '@/entities/day-note/model/day-note'
import { getCurrentUserId } from '@/shared/api/current-user'
import type { Database } from '@/shared/api/database.types'
import { fetchAllPages } from '@/shared/api/fetch-all-pages'
import { getSupabaseClient } from '@/shared/api/supabase'

type DayNoteRow = Database['public']['Tables']['day_notes']['Row']

function toDayNote(row: DayNoteRow): DayNote {
  const parsed = dayNoteSchema.safeParse({
    body: row.body,
    createdAt: row.created_at,
    id: row.id,
    journeyId: row.journey_id,
    localDate: row.local_date,
    updatedAt: row.updated_at,
  })
  if (!parsed.success) {
    throw new DayNoteError('invalid_row', parsed.error.message, parsed.error)
  }
  return parsed.data
}

function failure(
  fallback: 'delete_failed' | 'save_failed',
  error: { code?: string; message: string },
): DayNoteError {
  const code = error.code === '42501' ? 'forbidden' : fallback
  return new DayNoteError(code, error.message, error)
}

export async function listDayNotes(journeyId: string): Promise<DayNote[]> {
  const { data, error } = await fetchAllPages((from, to) =>
    getSupabaseClient()
      .from('day_notes')
      .select('*')
      .eq('journey_id', journeyId)
      .order('local_date', { ascending: true })
      .range(from, to),
  )
  if (error !== null) {
    throw new DayNoteError('list_failed', error.message, error)
  }
  return data.map(toDayNote)
}

async function updateBody(
  journeyId: string,
  localDate: string,
  body: string,
): Promise<DayNoteRow | null> {
  const { data, error } = await getSupabaseClient()
    .from('day_notes')
    .update({ body })
    .eq('journey_id', journeyId)
    .eq('local_date', localDate)
    .select('*')
    .maybeSingle()
  if (error !== null) throw failure('save_failed', error)
  return data
}

/**
 * Creates or replaces the note of a day. Update first, insert when the day has
 * no note yet (the grants allow updating only body and local_date, so a plain
 * upsert would be refused); a lost insert race falls back to the update.
 */
export async function saveDayNote(
  journeyId: string,
  localDate: string,
  rawBody: string,
): Promise<DayNote> {
  const body = rawBody.trim()
  if (body === '' || Array.from(body).length > DAY_NOTE_MAX_LENGTH) {
    throw new DayNoteError('invalid_input', 'note must be 1..20000 characters')
  }
  const updated = await updateBody(journeyId, localDate, body)
  if (updated !== null) return toDayNote(updated)
  const { data, error } = await getSupabaseClient()
    .from('day_notes')
    .insert({
      body,
      created_by: await getCurrentUserId(),
      journey_id: journeyId,
      local_date: localDate,
    })
    .select('*')
    .single()
  if (error !== null) {
    if (error.code === '23505') {
      const retry = await updateBody(journeyId, localDate, body)
      if (retry !== null) return toDayNote(retry)
    }
    throw failure('save_failed', error)
  }
  return toDayNote(data)
}

export async function deleteDayNote(
  journeyId: string,
  localDate: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('day_notes')
    .delete()
    .eq('journey_id', journeyId)
    .eq('local_date', localDate)
  if (error !== null) throw failure('delete_failed', error)
}
