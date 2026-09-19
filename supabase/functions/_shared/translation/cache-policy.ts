export interface ExistingTranslationSnapshot {
  is_manually_edited: boolean
  source_content_hash: string | null
  status: string
}

export function shouldReturnCachedTranslation(
  existing: ExistingTranslationSnapshot | null,
  options: {
    force: boolean | undefined
    sourceContentHash: string
  },
): boolean {
  if (existing === null) {
    return false
  }

  if (options.force === true) {
    return false
  }

  if (existing.status !== 'succeeded') {
    return false
  }

  if (existing.source_content_hash !== options.sourceContentHash) {
    return false
  }

  if (existing.is_manually_edited === true) {
    return false
  }

  return true
}
