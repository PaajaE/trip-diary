import {
  deriveTranslationStatus,
  type EntryTranslation,
  type TranslationDisplayStatus,
} from '@trip-diary/translation'

export type EntryTranslationPanelViewStatus =
  | TranslationDisplayStatus
  | 'requesting'

export interface EntryTranslationPanelPresentation {
  displayStatus: EntryTranslationPanelViewStatus
  showEditableFields: boolean
  showFailedProviderMessage: boolean
  showGenerateAction: boolean
  showPendingMessage: boolean
  showRetryAction: boolean
  showStaleMessage: boolean
  showTranslateAction: boolean
  statusMessageKey: string
}

export function resolveEntryTranslationPanelPresentation(input: {
  entry: { body: string; title: string; version: number }
  isRequestPending: boolean
  isSavePending: boolean
  translation: EntryTranslation | null | undefined
}): EntryTranslationPanelPresentation {
  const derivedStatus = deriveTranslationStatus(input.translation, input.entry)
  const displayStatus: EntryTranslationPanelViewStatus = input.isRequestPending
    ? 'requesting'
    : derivedStatus

  const showEditableFields =
    !input.isRequestPending &&
    (derivedStatus === 'succeeded' ||
      derivedStatus === 'stale' ||
      (derivedStatus === 'failed' &&
        (input.translation?.translated_body.length ?? 0) > 0))

  const statusMessageKey =
    displayStatus === 'requesting'
      ? 'entry.translation.translating'
      : `entry.translation.status.${derivedStatus}`

  return {
    displayStatus,
    showEditableFields,
    showFailedProviderMessage:
      derivedStatus === 'failed' &&
      input.translation?.error_message !== null &&
      input.translation?.error_message !== undefined,
    showGenerateAction: showEditableFields,
    showPendingMessage:
      derivedStatus === 'pending' || derivedStatus === 'processing',
    showRetryAction: derivedStatus === 'failed' && !input.isRequestPending,
    showStaleMessage: derivedStatus === 'stale',
    showTranslateAction: derivedStatus === 'none' && !input.isRequestPending,
    statusMessageKey,
  }
}
