/**
 * Who uploaded what in a shared journey (UX-43). Pure. Everything here is
 * silent (null / no chips) for a single-member journey and for media the
 * current user uploaded, so solo journeys look exactly as before.
 */
import type { TFunction } from 'i18next'

export interface UploaderModel {
  currentUserId: string | null
  /** More than one person contributes to the journey. */
  multi: boolean
  /** Display names by user id; a missing entry means "name unknown". */
  names: ReadonlyMap<string, string>
}

export const NO_UPLOADERS: UploaderModel = {
  currentUserId: null,
  multi: false,
  names: new Map(),
}

/** Whether media of `ownerId` should be marked with an uploader. */
export function isForeignUploader(
  model: UploaderModel,
  ownerId: string,
): boolean {
  return (
    model.multi &&
    model.currentUserId !== null &&
    ownerId !== model.currentUserId
  )
}

/**
 * Builds the model: `members` is null while unknown (or when the list could
 * not be read). Then "shared" is inferred from the media owners themselves.
 */
export function buildUploaderModel(
  currentUserId: string | null,
  members:
    | readonly {
        displayName: string | null
        userId: string
        username: string | null
      }[]
    | null,
  ownerIds: readonly string[],
): UploaderModel {
  if (currentUserId === null) return NO_UPLOADERS
  const names = new Map<string, string>()
  for (const member of members ?? []) {
    const name = (member.displayName ?? member.username ?? '').trim()
    if (name !== '') names.set(member.userId, name)
  }
  const multi =
    (members?.length ?? 0) > 1 ||
    ownerIds.some((ownerId) => ownerId !== currentUserId)
  return { currentUserId, multi, names }
}

/** "Uploaded by Jirina" (or the generic text); null when nothing to show. */
export function uploaderText(
  t: TFunction,
  model: UploaderModel,
  ownerId: string,
): string | null {
  if (!isForeignUploader(model, ownerId)) return null
  const name = model.names.get(ownerId)
  return name === undefined
    ? t('mediaBatch.uploader.byOther')
    : t('mediaBatch.uploader.by', { name })
}
