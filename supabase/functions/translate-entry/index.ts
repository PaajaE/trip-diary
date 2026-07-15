import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

import { handleOptions, jsonResponse } from '../_shared/http.ts'
import {
  hashSourceContent,
  parseAuthorizationHeader,
  parseTranslationRequest,
  resolveTranslationProvider,
  shouldReturnCachedTranslation,
  type TranslationLocale,
} from './logic.ts'

function createAuthedClient(authHeader: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (supabaseUrl === undefined || supabaseAnonKey === undefined) {
    throw new Error('Supabase environment is not configured')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  })
}

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options !== null) {
    return options
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  const authHeader = request.headers.get('Authorization')
  const authorization = parseAuthorizationHeader(authHeader)
  if (!authorization.ok) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  try {
    const supabase = createAuthedClient(authHeader)
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError !== null || user === null) {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse({ error: 'invalid_json' }, 400)
    }

    const parsed = parseTranslationRequest(body)
    if (!parsed.ok) {
      return jsonResponse({ error: parsed.error }, 400)
    }

    const { data: entry, error: entryError } = await supabase
      .from('entries')
      .select('id, title, body, language, version')
      .eq('id', parsed.data.entry_id)
      .maybeSingle()

    if (entryError !== null) {
      throw entryError
    }

    if (entry === null) {
      return jsonResponse({ error: 'entry_not_found' }, 404)
    }

    const sourceLocale = entry.language as TranslationLocale
    if (
      sourceLocale === parsed.data.target_locale &&
      parsed.data.force !== true
    ) {
      return jsonResponse({ error: 'same_locale' }, 400)
    }

    const provider = resolveTranslationProvider(
      Deno.env.get('TRANSLATION_API_KEY'),
    )
    const sourceContentHash = hashSourceContent(entry.title, entry.body)

    const { data: existing } = await supabase
      .from('entry_translations')
      .select('id, status, source_content_hash, is_manually_edited')
      .eq('entry_id', parsed.data.entry_id)
      .eq('target_locale', parsed.data.target_locale)
      .maybeSingle()

    if (
      shouldReturnCachedTranslation(existing, {
        force: parsed.data.force,
        sourceContentHash,
      })
    ) {
      const { data: cached } = await supabase
        .from('entry_translations')
        .select('*')
        .eq('id', existing.id)
        .single()

      if (cached !== null) {
        return jsonResponse({
          entry_id: cached.entry_id,
          model: cached.model,
          provider: cached.provider,
          source_locale: cached.source_locale,
          status: cached.status,
          target_locale: cached.target_locale,
          translated_body: cached.translated_body,
          translated_title: cached.translated_title,
        })
      }
    }

    const { data: processingRow, error: upsertError } = await supabase
      .from('entry_translations')
      .upsert(
        {
          entry_id: parsed.data.entry_id,
          error_message: null,
          provider: provider.id,
          requested_at: new Date().toISOString(),
          source_content_hash: sourceContentHash,
          source_locale: sourceLocale,
          source_version: entry.version,
          status: 'processing',
          target_locale: parsed.data.target_locale,
          translated_body: '',
          translated_title: null,
        },
        { onConflict: 'entry_id,target_locale' },
      )
      .select('id')
      .single()

    if (upsertError !== null) {
      throw upsertError
    }

    let translation: TranslationProviderResult
    try {
      translation = await provider.translate({
        body: entry.body,
        format: 'plain',
        sourceLocale,
        targetLocale: parsed.data.target_locale,
        title: entry.title,
      })
    } catch (providerError) {
      const message =
        providerError instanceof Error
          ? providerError.message
          : 'translation_provider_failed'
      await supabase
        .from('entry_translations')
        .update({
          completed_at: new Date().toISOString(),
          error_message: message,
          status: 'failed',
        })
        .eq('id', processingRow.id)
      return jsonResponse({ error: 'translation_failed' }, 502)
    }

    const { error: updateError } = await supabase
      .from('entry_translations')
      .update({
        completed_at: new Date().toISOString(),
        error_message: null,
        is_manually_edited: false,
        model: translation.model,
        provider: provider.id,
        source_content_hash: sourceContentHash,
        source_version: entry.version,
        status: 'succeeded',
        translated_body: translation.body,
        translated_title: translation.title,
      })
      .eq('id', processingRow.id)

    if (updateError !== null) {
      throw updateError
    }

    return jsonResponse({
      entry_id: parsed.data.entry_id,
      model: translation.model,
      provider: provider.id,
      source_locale: sourceLocale,
      status: 'succeeded',
      target_locale: parsed.data.target_locale,
      translated_body: translation.body,
      translated_title: translation.title,
    })
  } catch (error) {
    console.error('[translate-entry]', error)
    return jsonResponse({ error: 'translation_failed' }, 502)
  }
})
