import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { dayNoteQueryKeys } from '@/entities/day-note/api/day-note-query-keys'
import {
  deleteDayNote,
  listDayNotes,
  saveDayNote,
} from '@/entities/day-note/api/day-note.repository'
import type { DayNote } from '@/entities/day-note/model/day-note'

export interface DayNotes {
  /** Note text per local day ("YYYY-MM-DD"). */
  byDate: ReadonlyMap<string, string>
  /** Saves the trimmed text, deleting the note when it is empty. */
  save: (localDate: string, body: string) => Promise<boolean>
}

/** Day notes of a journey with an optimistic save/delete. */
export function useDayNotes(journeyId: string): DayNotes {
  const queryClient = useQueryClient()
  const key = useMemo(() => dayNoteQueryKeys.journey(journeyId), [journeyId])
  const query = useQuery({
    queryFn: () => listDayNotes(journeyId),
    queryKey: key,
  })
  const notes = query.data

  const byDate = useMemo(
    () => new Map((notes ?? []).map((note) => [note.localDate, note.body])),
    [notes],
  )

  const save = useCallback(
    async (localDate: string, raw: string): Promise<boolean> => {
      const body = raw.trim()
      const previous = queryClient.getQueryData<DayNote[]>(key)
      if (previous !== undefined) {
        const rest = previous.filter((note) => note.localDate !== localDate)
        const existing = previous.find((note) => note.localDate === localDate)
        queryClient.setQueryData<DayNote[]>(
          key,
          body === ''
            ? rest
            : [
                ...rest,
                existing === undefined
                  ? {
                      body,
                      createdAt: new Date(0).toISOString(),
                      id: crypto.randomUUID(),
                      journeyId,
                      localDate,
                      updatedAt: new Date(0).toISOString(),
                    }
                  : { ...existing, body },
              ].sort((a, b) => a.localDate.localeCompare(b.localDate)),
        )
      }
      try {
        if (body === '') await deleteDayNote(journeyId, localDate)
        else await saveDayNote(journeyId, localDate, body)
      } catch {
        if (previous !== undefined) queryClient.setQueryData(key, previous)
        return false
      }
      await queryClient
        .invalidateQueries({ queryKey: key })
        .catch(() => undefined)
      return true
    },
    [journeyId, key, queryClient],
  )

  return useMemo(() => ({ byDate, save }), [byDate, save])
}
