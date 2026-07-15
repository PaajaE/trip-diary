import { describe, expect, it } from 'vitest'
import {
  hashSourceContent,
  MockTranslationProvider,
  parseAuthorizationHeader,
  parseTranslationRequest,
  resolveTranslationProvider,
  shouldReturnCachedTranslation,
} from '../../../supabase/functions/translate-entry/logic.ts'
import { computeSourceContentHash } from './source-hash.ts'

const validEntryId = '550e8400-e29b-41d4-a716-446655440000'

describe('parseAuthorizationHeader', () => {
  it('accepts a bearer authorization header', () => {
    expect(parseAuthorizationHeader('Bearer jwt-token')).toEqual({ ok: true })
  })

  it('rejects missing authorization', () => {
    expect(parseAuthorizationHeader(null)).toEqual({ ok: false })
  })

  it('rejects non-bearer schemes', () => {
    expect(parseAuthorizationHeader('Basic abc')).toEqual({ ok: false })
  })
})

describe('parseTranslationRequest', () => {
  it('accepts a minimal valid request', () => {
    expect(
      parseTranslationRequest({
        entry_id: validEntryId,
        target_locale: 'en',
      }),
    ).toEqual({
      ok: true,
      data: {
        entry_id: validEntryId,
        force: undefined,
        target_locale: 'en',
      },
    })
  })

  it('accepts force regeneration flag', () => {
    expect(
      parseTranslationRequest({
        entry_id: validEntryId,
        force: true,
        target_locale: 'cs',
      }),
    ).toEqual({
      ok: true,
      data: {
        entry_id: validEntryId,
        force: true,
        target_locale: 'cs',
      },
    })
  })

  it('rejects non-object bodies', () => {
    expect(parseTranslationRequest(null)).toEqual({
      ok: false,
      error: 'invalid_request_body',
    })
    expect(parseTranslationRequest('request')).toEqual({
      ok: false,
      error: 'invalid_request_body',
    })
  })

  it('rejects invalid entry ids', () => {
    expect(
      parseTranslationRequest({
        entry_id: 'not-a-uuid',
        target_locale: 'en',
      }),
    ).toEqual({ ok: false, error: 'invalid_entry_id' })

    expect(
      parseTranslationRequest({
        entry_id: 123,
        target_locale: 'en',
      }),
    ).toEqual({ ok: false, error: 'invalid_entry_id' })
  })

  it('rejects non-rfc4122 uuids', () => {
    expect(
      parseTranslationRequest({
        entry_id: '00000000-0000-0000-0000-000000000000',
        target_locale: 'en',
      }),
    ).toEqual({ ok: false, error: 'invalid_entry_id' })
  })

  it('rejects invalid target locales', () => {
    expect(
      parseTranslationRequest({
        entry_id: validEntryId,
        target_locale: 'de',
      }),
    ).toEqual({ ok: false, error: 'invalid_target_locale' })

    expect(
      parseTranslationRequest({
        entry_id: validEntryId,
        target_locale: 1,
      }),
    ).toEqual({ ok: false, error: 'invalid_target_locale' })
  })

  it('rejects invalid force values', () => {
    expect(
      parseTranslationRequest({
        entry_id: validEntryId,
        force: 'yes',
        target_locale: 'en',
      }),
    ).toEqual({ ok: false, error: 'invalid_force' })
  })
})

describe('hashSourceContent', () => {
  it('matches computeSourceContentHash from @trip-diary/translation', () => {
    const cases: [string | null, string][] = [
      [null, ''],
      ['Hello', 'World'],
      [null, 'Body only'],
      ['A', 'B'],
      ['Žlutá', 'cesta'],
    ]

    for (const [title, body] of cases) {
      expect(hashSourceContent(title, body)).toBe(
        computeSourceContentHash(title, body),
      )
    }
  })
})

describe('shouldReturnCachedTranslation', () => {
  const sourceContentHash = computeSourceContentHash('Title', 'Body')

  const cachedTranslation = {
    is_manually_edited: false,
    source_content_hash: sourceContentHash,
    status: 'succeeded',
  }

  it('returns cached translation for matching succeeded rows', () => {
    expect(
      shouldReturnCachedTranslation(cachedTranslation, {
        force: undefined,
        sourceContentHash,
      }),
    ).toBe(true)

    expect(
      shouldReturnCachedTranslation(cachedTranslation, {
        force: false,
        sourceContentHash,
      }),
    ).toBe(true)
  })

  it('skips cache when force regeneration is requested', () => {
    expect(
      shouldReturnCachedTranslation(cachedTranslation, {
        force: true,
        sourceContentHash,
      }),
    ).toBe(false)
  })

  it('skips cache when no existing row is present', () => {
    expect(
      shouldReturnCachedTranslation(null, {
        force: undefined,
        sourceContentHash,
      }),
    ).toBe(false)
  })

  it('skips cache when status is not succeeded', () => {
    for (const status of ['pending', 'processing', 'failed', 'stale']) {
      expect(
        shouldReturnCachedTranslation(
          { ...cachedTranslation, status },
          { force: undefined, sourceContentHash },
        ),
      ).toBe(false)
    }
  })

  it('skips cache when source content hash changed', () => {
    expect(
      shouldReturnCachedTranslation(cachedTranslation, {
        force: undefined,
        sourceContentHash: 'deadbeef',
      }),
    ).toBe(false)
  })

  it('skips cache for manually edited translations', () => {
    expect(
      shouldReturnCachedTranslation(
        { ...cachedTranslation, is_manually_edited: true },
        { force: undefined, sourceContentHash },
      ),
    ).toBe(false)
  })
})

describe('resolveTranslationProvider', () => {
  it('uses the mock provider when TRANSLATION_API_KEY is unset', () => {
    const provider = resolveTranslationProvider(undefined)

    expect(provider).toBeInstanceOf(MockTranslationProvider)
    expect(provider.id).toBe('mock')
  })

  it('uses the mock provider when TRANSLATION_API_KEY is blank', () => {
    const provider = resolveTranslationProvider('   ')

    expect(provider).toBeInstanceOf(MockTranslationProvider)
    expect(provider.id).toBe('mock')
  })

  it('still uses mock until a paid provider is deliberately wired', () => {
    const provider = resolveTranslationProvider('sk-live-example')

    expect(provider).toBeInstanceOf(MockTranslationProvider)
    expect(provider.id).toBe('mock')
  })
})

describe('MockTranslationProvider', () => {
  it('prefixes translated content with the target locale', async () => {
    const provider = new MockTranslationProvider()

    await expect(
      provider.translate({
        body: 'Body text',
        format: 'plain',
        sourceLocale: 'cs',
        targetLocale: 'en',
        title: 'Praha',
      }),
    ).resolves.toEqual({
      body: '[en] Body text',
      model: 'mock-model',
      title: '[en] Praha',
    })
  })
})
