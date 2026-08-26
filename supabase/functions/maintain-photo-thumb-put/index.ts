/**
 * One-shot privileged writer used during the production thumb backfill.
 * Retired after the backfill completed — re-enable only for a controlled
 * maintenance window, gated by a short-lived token, then disable again.
 *
 * Prefer running `pnpm backfill:photo-thumbs` with SUPABASE_SERVICE_ROLE_KEY
 * for future maintenance instead of redeploying this function.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

Deno.serve((_req: Request) =>
  new Response(
    JSON.stringify({
      error: 'disabled',
      message: 'one-shot photo thumb backfill writer retired',
    }),
    {
      status: 410,
      headers: { 'Content-Type': 'application/json' },
    },
  ),
)
