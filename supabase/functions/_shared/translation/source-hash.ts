export function computeSourceContentHash(
  title: string | null,
  body: string,
): string {
  const canonical = `${title ?? ''}\n---\n${body}`
  let hash = 0

  for (let index = 0; index < canonical.length; index += 1) {
    hash = (hash * 31 + canonical.charCodeAt(index)) >>> 0
  }

  return hash.toString(16).padStart(8, '0')
}
