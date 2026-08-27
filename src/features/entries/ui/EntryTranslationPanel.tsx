import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useEntryTranslationQuery,
  useRequestEntryTranslationMutation,
  useSaveEntryTranslationEditsMutation,
} from '@/entities/translation/api'
import { resolveEntryTranslationPanelPresentation } from '@/entities/translation/lib/entry-translation-panel-state'
import {
  formatStoredTranslationErrorMessage,
  formatTranslationErrorMessage,
} from '@/entities/translation/lib/format-translation-error'
import { Button } from '@/shared/ui/Button'
import { Input } from '@/shared/ui/Input'

const ENGLISH_TARGET_LOCALE = 'en' as const

interface EntryTranslationPanelProps {
  entry: {
    body: string
    id: string
    language: 'cs' | 'en'
    title: string
    version: number
  }
  variant?: 'card' | 'inline'
}

export function EntryTranslationPanel({
  entry,
  variant = 'card',
}: EntryTranslationPanelProps) {
  const { t } = useTranslation()
  const translationQuery = useEntryTranslationQuery(
    entry.id,
    ENGLISH_TARGET_LOCALE,
    entry.language === 'cs',
  )
  const requestMutation = useRequestEntryTranslationMutation()
  const saveMutation = useSaveEntryTranslationEditsMutation()
  const translation = translationQuery.data ?? null
  const remoteTitle = translation?.translated_title ?? ''
  const remoteBody = translation?.translated_body ?? ''
  const remoteRevision = `${translation?.id ?? 'none'}:${translation?.updated_at ?? ''}:${translation?.status ?? 'none'}`
  const [draftRevision, setDraftRevision] = useState(remoteRevision)
  const [translatedTitle, setTranslatedTitle] = useState(remoteTitle)
  const [translatedBody, setTranslatedBody] = useState(remoteBody)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  if (remoteRevision !== draftRevision && !saveMutation.isPending) {
    setDraftRevision(remoteRevision)
    setTranslatedTitle(remoteTitle)
    setTranslatedBody(remoteBody)
  }

  if (entry.language !== 'cs') {
    return null
  }

  const presentation = resolveEntryTranslationPanelPresentation({
    entry,
    isRequestPending: requestMutation.isPending,
    isSavePending: saveMutation.isPending,
    translation,
  })
  const statusLabel = t(presentation.statusMessageKey)
  const queryErrorMessage =
    translationQuery.isError && translation === null
      ? formatTranslationErrorMessage(translationQuery.error, t)
      : null

  async function runTranslation(force: boolean) {
    setRequestError(null)

    try {
      await requestMutation.mutateAsync({
        entryId: entry.id,
        force,
        targetLocale: ENGLISH_TARGET_LOCALE,
      })
    } catch (error) {
      setRequestError(formatTranslationErrorMessage(error, t))
    }
  }

  async function handleSaveEdits() {
    if (translation === null) {
      return
    }

    setSaveError(null)

    try {
      await saveMutation.mutateAsync({
        entryId: entry.id,
        targetLocale: ENGLISH_TARGET_LOCALE,
        translatedBody,
        translatedTitle: translatedTitle.length > 0 ? translatedTitle : null,
        translationId: translation.id,
      })
    } catch (error) {
      setSaveError(
        formatTranslationErrorMessage(error, t, 'entry.translation.saveError'),
      )
    }
  }

  const isInline = variant === 'inline'

  return (
    <section
      aria-labelledby="entry-translation-heading"
      className={
        isInline
          ? 'mt-4 space-y-4 border-t border-border/40 pt-4'
          : 'mt-8 space-y-4 rounded-2xl border border-border bg-surface p-5'
      }
    >
      <div
        className={
          isInline
            ? 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2'
            : 'flex flex-wrap items-center justify-between gap-3'
        }
      >
        <h3
          className={
            isInline
              ? 'text-sm font-medium text-foreground'
              : 'text-lg font-semibold'
          }
          id="entry-translation-heading"
        >
          {t('entry.translation.title')}
        </h3>
        <p
          className="text-sm text-muted"
          data-testid="entry-translation-status"
        >
          {statusLabel}
          {translationQuery.isFetching &&
          !translationQuery.isLoading &&
          !requestMutation.isPending ? (
            <span className="sr-only">{t('entry.translation.refreshing')}</span>
          ) : null}
        </p>
      </div>

      {queryErrorMessage !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {queryErrorMessage}
        </p>
      ) : null}

      {presentation.showTranslateAction ? (
        <div className={isInline ? 'flex justify-end' : undefined}>
          <Button
            className={
              isInline ? 'min-h-9 px-0 text-sm font-medium' : undefined
            }
            disabled={requestMutation.isPending}
            onClick={() => {
              void runTranslation(false)
            }}
            variant={isInline ? 'ghost' : 'primary'}
          >
            {requestMutation.isPending
              ? t('entry.translation.translating')
              : isInline
                ? `${t('entry.translation.translateAction')} →`
                : t('entry.translation.translateAction')}
          </Button>
        </div>
      ) : null}

      {presentation.showPendingMessage ? (
        <p className="text-sm text-muted">{statusLabel}</p>
      ) : null}

      {presentation.showFailedProviderMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {formatStoredTranslationErrorMessage(
            translation?.error_message ?? '',
            t,
          )}
        </p>
      ) : null}

      {presentation.showStaleMessage ? (
        <p className="text-sm text-amber-900">{statusLabel}</p>
      ) : null}

      {requestError !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {requestError}
        </p>
      ) : null}

      {saveError !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}

      {presentation.showEditableFields ? (
        <div className="space-y-4">
          <Input
            label={t('entry.translation.translatedTitle')}
            onChange={(event) => {
              setTranslatedTitle(event.target.value)
            }}
            value={translatedTitle}
          />
          <label className="block text-sm font-medium">
            {t('entry.translation.translatedBody')}
            <textarea
              className="mt-2 min-h-32 w-full rounded-md border border-border bg-background px-3 py-3 text-base"
              onChange={(event) => {
                setTranslatedBody(event.target.value)
              }}
              value={translatedBody}
            />
          </label>
          <p className="text-sm text-muted">
            {t('entry.translation.manualEditHint')}
          </p>
          {translation?.is_manually_edited === true ? (
            <p className="text-sm text-amber-900" role="note">
              {t('entry.translation.regenerateManualEditWarning')}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              disabled={
                saveMutation.isPending ||
                requestMutation.isPending ||
                presentation.displayStatus === 'pending' ||
                presentation.displayStatus === 'processing'
              }
              onClick={() => {
                void handleSaveEdits()
              }}
              type="button"
              variant="secondary"
            >
              {saveMutation.isPending
                ? t('entry.translation.savingEdits')
                : t('entry.translation.saveEditsAction')}
            </Button>
            <Button
              disabled={requestMutation.isPending || saveMutation.isPending}
              onClick={() => {
                void runTranslation(true)
              }}
              type="button"
              variant="secondary"
            >
              {requestMutation.isPending
                ? t('entry.translation.translating')
                : t('entry.translation.regenerateAction')}
            </Button>
          </div>
        </div>
      ) : null}

      {presentation.showRetryAction ? (
        <Button
          disabled={requestMutation.isPending}
          onClick={() => {
            void runTranslation(false)
          }}
          variant="secondary"
        >
          {requestMutation.isPending
            ? t('entry.translation.translating')
            : t('entry.translation.retryAction')}
        </Button>
      ) : null}
    </section>
  )
}
