import { isTranslationLocale, type TranslationLocale } from './locale.ts'

export interface TranslationRequest {
  entry_id: string
  force?: boolean
  target_locale: TranslationLocale
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
      target_locale: body.target_locale,
      ...(body.force === undefined ? {} : { force: body.force }),
    },
  }
}
