import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Mic, Square } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateJourneyTree } from '@/entities/journey/api/invalidate-journey-tree'
import { useSession } from '@/features/auth/session/use-session'
import {
  saveQuickNote,
  type QuickNoteResult,
} from '@/features/quick-note/api/save-quick-note'
import { loadDraft, saveDraft } from '@/features/quick-note/lib/draft'
import {
  formatElapsed,
  useDictation,
} from '@/features/quick-note/lib/use-dictation'
import { BODY_MAX_LENGTH } from '@/features/journey-workspace/lib/text-edit'
import { isGeolocationAvailable } from '@/shared/lib/geolocation'
import { haptic } from '@/shared/lib/haptics'
import { Button } from '@/shared/ui/Button'
import { buttonVariants } from '@/shared/ui/button-variants'
import { Card } from '@/shared/ui/PageLayout'

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; located: boolean }
  | { kind: 'error'; reason: Exclude<QuickNoteResult, { ok: true }>['reason'] }

export function QuickNotePage({
  journeyId,
  startVoice = false,
}: {
  journeyId: string
  startVoice?: boolean
}) {
  const { user } = useSession()
  if (user === null) return null
  return (
    <QuickNoteView
      journeyId={journeyId}
      startVoice={startVoice}
      userId={user.id}
    />
  )
}

function QuickNoteView({
  journeyId,
  startVoice,
  userId,
}: {
  journeyId: string
  startVoice: boolean
  userId: string
}) {
  const { i18n, t } = useTranslation()
  const queryClient = useQueryClient()
  const ids = useId()
  const canLocate = isGeolocationAvailable()
  const [text, setText] = useState(() => loadDraft(journeyId))
  const [useLocation, setUseLocation] = useState(canLocate)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const savingRef = useRef(false)
  const saving = status.kind === 'saving'
  const textRef = useRef(text)
  useEffect(() => {
    textRef.current = text
  })
  const dictation = useDictation({
    getBase: () => textRef.current,
    lang: i18n.language.startsWith('cs') ? 'cs-CZ' : 'en-US',
    onText: (next) => {
      setText(next)
      saveDraft(journeyId, next)
      setStatus((current) =>
        current.kind === 'saving' ? current : { kind: 'idle' },
      )
    },
  })
  const { start: startDictation, supported: canDictate } = dictation
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!startVoice || !canDictate || autoStarted.current) return
    autoStarted.current = true
    startDictation()
  }, [startVoice, canDictate, startDictation])

  const submit = async () => {
    if (savingRef.current) return
    dictation.stop()
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
      haptic('warning')
      setStatus({ kind: 'error', reason: result.reason })
      return
    }
    haptic('success')
    saveDraft(journeyId, '')
    setText('')
    setStatus({ kind: 'saved', located: result.located })
    void invalidateJourneyTree(queryClient, journeyId).catch(() => undefined)
  }

  const error = status.kind === 'error' ? status.reason : null
  const errorId = `${ids}-error`

  return (
    <Card className="mx-auto max-w-2xl">
      <form
        className="space-y-5"
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
            className="mt-2 block min-h-48 sm:min-h-64 w-full resize-y rounded-md border border-border bg-background px-4 py-3 text-base leading-7 outline-none focus:border-primary"
            id={`${ids}-text`}
            readOnly={dictation.listening}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              saveDraft(journeyId, event.target.value)
              if (status.kind !== 'saving') setStatus({ kind: 'idle' })
            }}
          />
          {canDictate ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {dictation.listening ? (
                <>
                  <span
                    className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-destructive"
                    data-testid="dictation-listening"
                    role="status"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 animate-pulse rounded-full bg-destructive"
                    />
                    {t('quickNote.dictateListening', {
                      time: formatElapsed(dictation.seconds),
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={dictation.stop}
                  >
                    <Square aria-hidden="true" className="mr-2" size={14} />
                    {t('quickNote.dictateStop')}
                  </Button>
                </>
              ) : (
                <Button
                  disabled={saving}
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    haptic('light')
                    dictation.start()
                  }}
                >
                  <Mic aria-hidden="true" className="mr-2" size={16} />
                  {t('quickNote.dictate')}
                </Button>
              )}
              <p className="text-sm text-muted">{t('quickNote.dictateHint')}</p>
            </div>
          ) : null}
          {dictation.problem === null ? null : (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {dictation.problem === 'denied'
                ? t('quickNote.dictateDenied')
                : t('quickNote.dictateFailed')}
            </p>
          )}
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
            <p className="text-sm text-destructive" role="alert">
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
            className={buttonVariants({ variant: 'secondary' })}
            params={{ journeyId }}
            to="/j/$journeyId/import"
          >
            {t('quickNote.addPhotos')}
          </Link>
        </div>
      </form>
    </Card>
  )
}
