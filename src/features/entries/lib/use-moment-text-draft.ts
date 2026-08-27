import { useCallback, useEffect, useRef, useState } from 'react'
import { updateEntryContent } from '@/entities/entry/api/entry-mutation.repository'
import type { Entry } from '@/entities/entry/model/entry'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'

const BODY_MAX_LENGTH = 50_000
const TITLE_MAX_LENGTH = 160
const AUTOSAVE_DELAY_MS = 700

export type MomentTextSaveState = 'idle' | 'saving' | 'saved' | 'error'

interface UseMomentTextDraftOptions {
  creatorId: string
  enabled: boolean
  entry: Entry
  onUpdated: (entry: Entry) => void
}

export function useMomentTextDraft({
  creatorId,
  enabled,
  entry,
  onUpdated,
}: UseMomentTextDraftOptions) {
  const [draftKey, setDraftKey] = useState(entry.id)
  const [title, setTitle] = useState(entry.title)
  const [body, setBody] = useState(entry.body)
  const [savedTitle, setSavedTitle] = useState(entry.title)
  const [savedBody, setSavedBody] = useState(entry.body)
  const [saveState, setSaveState] = useState<MomentTextSaveState>('idle')
  const savingRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const onUpdatedRef = useRef(onUpdated)

  useEffect(() => {
    onUpdatedRef.current = onUpdated
  }, [onUpdated])

  if (enabled && draftKey !== entry.id) {
    setDraftKey(entry.id)
    setTitle(entry.title)
    setBody(entry.body)
    setSavedTitle(entry.title)
    setSavedBody(entry.body)
    setSaveState('idle')
  }

  const dirty = title !== savedTitle || body !== savedBody

  const persist = useCallback(
    async (nextTitle: string, nextBody: string): Promise<boolean> => {
      if (savingRef.current) {
        return false
      }
      if (nextTitle === savedTitle && nextBody === savedBody) {
        return true
      }
      if (nextBody.length > BODY_MAX_LENGTH) {
        setSaveState('error')
        return false
      }

      savingRef.current = true
      setSaveState('saving')

      try {
        const updated = await updateEntryContent(entry.id, creatorId, {
          body: nextBody,
          title: nextTitle.slice(0, TITLE_MAX_LENGTH),
        })
        setSavedTitle(updated.title)
        setSavedBody(updated.body)
        onUpdatedRef.current(updated)
        setSaveState('saved')
        try {
          if (await canAutomaticallySync()) {
            void syncPendingOperations().catch(() => {
              // Background sync can retry later.
            })
          }
        } catch {
          // Local draft is already persisted.
        }
        return true
      } catch {
        setSaveState('error')
        return false
      } finally {
        savingRef.current = false
      }
    },
    [creatorId, entry.id, savedBody, savedTitle],
  )

  useEffect(() => {
    if (!enabled || !dirty) {
      return
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      void persist(title, body)
    }, AUTOSAVE_DELAY_MS)
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [body, dirty, enabled, persist, title])

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (title === savedTitle && body === savedBody) {
      return true
    }
    return persist(title, body)
  }, [body, persist, savedBody, savedTitle, title])

  return {
    body,
    dirty,
    flushSave,
    saveState,
    setBody,
    setTitle,
    title,
  }
}
