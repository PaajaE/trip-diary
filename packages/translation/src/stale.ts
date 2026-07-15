import { computeSourceContentHash } from './source-hash.ts'
import type { EntryTranslation, TranslationDisplayStatus } from './types.ts'

export function deriveTranslationStatus(
  translation: EntryTranslation | null | undefined,
  entry: { title: string | null; body: string; version: number },
): TranslationDisplayStatus {
  if (translation == null) {
    return 'none'
  }

  if (translation.status !== 'succeeded') {
    return translation.status
  }

  if (translation.target_locale === translation.source_locale) {
    return 'succeeded'
  }

  const currentHash = computeSourceContentHash(entry.title, entry.body)
  const isOutdated =
    translation.source_version !== entry.version ||
    translation.source_content_hash !== currentHash

  return isOutdated ? 'stale' : 'succeeded'
}
