export type TranslationLocale = 'cs' | 'en'

export type TranslationFormat = 'plain' | 'markdown'

export interface TranslationRequest {
  entry_id: string
  force?: boolean
  target_locale: TranslationLocale
}

export interface TranslationProviderInput {
  body: string
  format: TranslationFormat
  sourceLocale: TranslationLocale
  targetLocale: TranslationLocale
  title: string | null
}

export interface TranslationProviderResult {
  body: string
  model: string
  title: string | null
}

export interface TranslationProvider {
  readonly id: string
  translate(input: TranslationProviderInput): Promise<TranslationProviderResult>
}

export class MockTranslationProvider implements TranslationProvider {
  readonly id = 'mock'

  async translate(
    input: TranslationProviderInput,
  ): Promise<TranslationProviderResult> {
    const prefix = `[${input.targetLocale}]`

    return {
      body: `${prefix} ${input.body}`,
      model: 'mock-model',
      title: input.title === null ? null : `${prefix} ${input.title}`,
    }
  }
}

/**
 * Resolves the active translation provider from server configuration.
 * When TRANSLATION_API_KEY is unset (local dev, CI, tests), the mock provider
 * is used so no paid API calls are made. Production activation requires
 * deliberately wiring a real provider here once credentials are available.
 */
export function resolveTranslationProvider(
  translationApiKey: string | undefined,
): TranslationProvider {
  if (translationApiKey === undefined || translationApiKey.trim() === '') {
    return new MockTranslationProvider()
  }

  // Real provider wiring lands in a follow-up once API credentials are available.
  return new MockTranslationProvider()
}

export interface ExistingTranslationSnapshot {
  is_manually_edited: boolean
  source_content_hash: string | null
  status: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TRANSLATION_LOCALES = new Set<TranslationLocale>(['cs', 'en'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTranslationLocale(value: unknown): value is TranslationLocale {
  return (
    typeof value === 'string' &&
    TRANSLATION_LOCALES.has(value as TranslationLocale)
  )
}

export function parseAuthorizationHeader(
  authHeader: string | null,
): { ok: true } | { ok: false } {
  if (authHeader === null || !authHeader.startsWith('Bearer ')) {
    return { ok: false }
  }

  return { ok: true }
}

export function parseTranslationRequest(
  body: unknown,
): { ok: true; data: TranslationRequest } | { ok: false; error: string } {
  if (!isRecord(body)) {
    return { ok: false, error: 'invalid_request_body' }
  }

  const entryId = body.entry_id
  if (typeof entryId !== 'string' || !UUID_PATTERN.test(entryId)) {
    return { ok: false, error: 'invalid_entry_id' }
  }

  if (!isTranslationLocale(body.target_locale)) {
    return { ok: false, error: 'invalid_target_locale' }
  }

  if (body.force !== undefined && typeof body.force !== 'boolean') {
    return { ok: false, error: 'invalid_force' }
  }

  return {
    ok: true,
    data: {
      entry_id: entryId,
      force: body.force,
      target_locale: body.target_locale,
    },
  }
}

export function hashSourceContent(title: string | null, body: string): string {
  const canonical = `${title ?? ''}\n---\n${body}`
  let hash = 0
  for (let index = 0; index < canonical.length; index += 1) {
    hash = (hash * 31 + canonical.charCodeAt(index)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
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
