/** Must match SHELL_ID in scripts/lib/prerender.mjs. */
export const PRERENDER_SHELL_ID = 'prerender-shell'

/**
 * Prerendered journey pages paint a static hero (`#prerender-shell`) while
 * `#root` is hidden. Once React has rendered real content, drop the shell and
 * reveal the root in the same task, so the swap does not flash or shift.
 * No-op on pages without a shell.
 */
export function releasePrerenderShell(doc: Document = document): void {
  doc.getElementById(PRERENDER_SHELL_ID)?.remove()
  const root = doc.getElementById('root')
  if (root !== null) root.hidden = false
}
