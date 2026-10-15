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

/**
 * Like {@link releasePrerenderShell}, but waits (at most `timeoutMs`) for the
 * hero image React rendered in `#root`. The shell's image may be a same-origin
 * copy of a different URL, so removing the shell at once could flash an empty
 * hero. Returns a cancel function.
 */
export function releasePrerenderShellWhenReady(
  doc: Document = document,
  timeoutMs = 2000,
): () => void {
  const image = doc.querySelector<HTMLImageElement>('#root img')
  if (
    doc.getElementById(PRERENDER_SHELL_ID) === null ||
    image === null ||
    image.complete
  ) {
    releasePrerenderShell(doc)
    return () => undefined
  }
  const release = () => {
    cancel()
    releasePrerenderShell(doc)
  }
  const timer = window.setTimeout(release, timeoutMs)
  const cancel = () => {
    window.clearTimeout(timer)
    image.removeEventListener('load', release)
    image.removeEventListener('error', release)
  }
  image.addEventListener('load', release)
  image.addEventListener('error', release)
  return cancel
}
