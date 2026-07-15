# Translation provider contract

Trip Diary translates Czech entry content to English through the `translate-entry` Supabase Edge Function. The web client never talks to a paid translation API directly.

## Server secret: `TRANSLATION_API_KEY`

- Set `TRANSLATION_API_KEY` only in Supabase Edge Function secrets (or local `supabase/functions/.env` for development).
- Never expose this value to the browser, mobile app, GitHub Actions artifacts, or client-side env files.
- When the secret is unset or blank, the edge function uses the mock provider so local dev, CI, and staging do not incur translation costs.

## Provider interface

Shared contract lives in `@trip-diary/translation` (`TranslationProvider`) and is mirrored in `supabase/functions/translate-entry/logic.ts` for Deno execution.

```ts
interface TranslationProviderInput {
  body: string
  format: 'plain' | 'markdown'
  sourceLocale: 'cs' | 'en'
  targetLocale: 'cs' | 'en'
  title: string | null
}

interface TranslationProviderResult {
  body: string
  model: string
  title: string | null
}

interface TranslationProvider {
  readonly id: string
  translate(input: TranslationProviderInput): Promise<TranslationProviderResult>
}
```

Implementations must:

- Return plain translated text for the requested target locale.
- Populate `model` with the provider/model identifier used for auditing.
- Throw on provider failures so the edge function can mark the row as `failed` and return `translation_failed`.

## Mock provider (dev/test only)

`MockTranslationProvider` prefixes output with `[targetLocale]` and uses `mock-model`. It is selected automatically when `TRANSLATION_API_KEY` is missing.

Use the mock for:

- Local Supabase development
- Automated tests (`packages/translation`, web repository tests, SQL RLS tests)
- Staging environments where paid translation is intentionally disabled

Do not rely on mock output in production user-facing content.

## Production activation

Turning on a paid provider requires an explicit product decision:

1. Choose the vendor and billing model.
2. Store credentials in Supabase secrets as `TRANSLATION_API_KEY`.
3. Wire the real provider inside `resolveTranslationProvider()` in `supabase/functions/translate-entry/logic.ts`.
4. Deploy the edge function and verify RLS, stale detection, and manual-edit behavior in staging before enabling for users.

Until that wiring lands, setting `TRANSLATION_API_KEY` still resolves to the mock provider to prevent accidental paid calls.

## Client integration

Data access lives in `src/entities/translation/api/translation.repository.ts`:

- `getEntryTranslation(entryId, targetLocale)` — reads `entry_translations`
- `requestEntryTranslation(request)` — invokes `translate-entry`
- `saveEntryTranslationEdits(translationId, input)` — persists manual edits

The web UI consumes these through React Query hooks exported from `src/entities/translation/api/`:

| Hook                                   | Role                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `useEntryTranslationQuery`             | Reads translation; polls every **3s** while status is `pending` or `processing` |
| `useRequestEntryTranslationMutation`   | Generate/regenerate; invalidates the detail query on success                    |
| `useSaveEntryTranslationEditsMutation` | Manual save; updates cached translation via `setQueryData`                      |

**Query keys:** `translationQueryKeys.detail(entryId, targetLocale)` under namespace `entry-translations`. Entry edits call `invalidateEntryTranslations(queryClient, entryId)` to refresh stale/succeeded state without broad invalidation.

**Display status:** `@trip-diary/translation` `deriveTranslationStatus()` compares source hash/version for stale detection — not duplicated in UI.

Known edge-function error codes (`translation_failed`, `unauthorized`, `entry_not_found`, etc.) map to localized messages via `formatTranslationErrorMessage()`. Stored provider errors in `error_message` use safe generic copy when not a known code.

**Deprecated import:** `@/features/entries/api/translation.repository` re-exports the entity repository for compatibility.

**Deferred:** Supabase Realtime, mobile translation UI, paid provider wiring, global web query-key refactor (H9).
