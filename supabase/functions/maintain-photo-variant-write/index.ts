/**
 * One-shot privileged writer used during the responsive photo-variant backfill.
 * Retired after the backfill completed. Prefer `pnpm backfill:photo-variants`
 * with SUPABASE_SERVICE_ROLE_KEY for future maintenance.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

Deno.serve(
  (_req: Request) =>
    new Response(
      JSON.stringify({
        error: 'disabled',
        message: 'one-shot photo variant maintenance writer retired',
      }),
      {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      },
    ),
)
