import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { useSession } from '@/features/auth/session/use-session'
import {
  saveQuickNote,
  type QuickNoteResult,
} from '@/features/quick-note/api/save-quick-note'
import { loadDraft, saveDraft } from '@/features/quick-note/lib/draft'
import { BODY_MAX_LENGTH } from '@/features/journey-workspace/lib/text-edit'
import { isGeolocationAvailable } from '@/shared/lib/geolocation'
import { Button } from '@/shared/ui/Button'

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; located: boolean }
  | { kind: 'error'; reason: Exclude<QuickNoteResult, { ok: true }>['reason'] }

export function QuickNotePage({ journeyId }: { journeyId: string }) {
  const { user } = useSession()
  if (user === null) return null
  return <QuickNoteView journeyId={journeyId} userId={user.id} />
}

function QuickNoteView({
  journeyId,
  userId,
}: {
  journeyId: string
  userId: string
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const ids = useId()
  const canLocate = isGeolocationAvailable()
  const [text, setText] = useState(() => loadDraft(journeyId))
  const [useLocation, setUseLocation] = useState(canLocate)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const savingRef = useRef(false)
  const saving = status.kind === 'saving'

  const submit = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setStatus({ kind: 'saving' })
    const result = await saveQuickNote({
      journeyId,
      text,
      useLocation: canLocate && useLocation,
      userId,
    }).finally(() => {
      savingRef.current = false
    })
    if (!result.ok) {
      setStatus({ kind: 'error', reason: result.reason })
      return
    }
    saveDraft(journeyId, '')
    setText('')
    setStatus({ kind: 'saved', located: result.located })
    void invalidateJourneyTree(queryClient, journeyId).catch(() => undefined)
  }

  const error = status.kind === 'error' ? status.reason : null
  const errorId = `${ids}-error`

  return (
    <main className="mx-auto max-w-xl space-y-5 px-5 py-6">
      <div>
        <Link
          className="text-sm text-muted underline"
          params={{ journeyId }}
          to="/j/$journeyId/workspace"
        >
          {t('mediaImport.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t('quickNote.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('quickNote.subtitle')}</p>
      </div>

      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div>
          <label className="text-sm font-semibold" htmlFor={`${ids}-text`}>
            {t('quickNote.label')}
          </label>
          <textarea
            aria-describedby={error !== null ? errorId : undefined}
            aria-invalid={error === 'empty' || error === 'too_long'}
            className="mt-1 block min-h-[40vh] w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-base leading-7"
            id={`${ids}-text`}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              saveDraft(journeyId, event.target.value)
              if (status.kind !== 'saving') setStatus({ kind: 'idle' })
            }}
          />
        </div>

        {canLocate ? (
          <div className="flex min-h-11 items-start gap-3 text-sm">
            <input
              aria-describedby={`${ids}-loc-hint`}
              checked={useLocation}
              className="mt-1 size-5"
              id={`${ids}-loc`}
              type="checkbox"
              onChange={(event) => {
                setUseLocation(event.target.checked)
              }}
            />
            <div>
              <label className="font-semibold" htmlFor={`${ids}-loc`}>
                {t('quickNote.useLocation')}
              </label>
              <p className="text-muted" id={`${ids}-loc-hint`}>
                {t('quickNote.locationHint')}
              </p>
            </div>
          </div>
        ) : null}

        <div aria-live="polite" id={errorId}>
          {error !== null ? (
            <p className="text-sm text-red-600" role="alert">
              {error === 'empty'
                ? t('quickNote.empty')
                : error === 'too_long'
                  ? t('workspace.textBodyTooLong', { max: BODY_MAX_LENGTH })
                  : t('quickNote.saveFailed')}
            </p>
          ) : null}
          {status.kind === 'saved' ? (
            <p className="text-sm" role="status">
              {status.located
                ? t('quickNote.saved')
                : t('quickNote.savedNoLocation')}{' '}
              <Link
                className="font-semibold underline"
                params={{ journeyId }}
                to="/j/$journeyId/workspace"
              >
                {t('quickNote.showInWorkspace')}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button className="w-full sm:w-auto" disabled={saving} type="submit">
            {saving ? t('quickNote.saving') : t('quickNote.save')}
          </Button>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border/80 px-5 text-sm font-semibold"
            params={{ journeyId }}
            to="/j/$journeyId/import"
          >
            {t('quickNote.addPhotos')}
          </Link>
        </div>
      </form>
    </main>
  )
}
