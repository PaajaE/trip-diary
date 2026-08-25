export function excerptText(body: string, maxChars = 140): string {
  const normalized = body.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) {
    return normalized
  }

  const slice = normalized.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  const clipped = (lastSpace > 48 ? slice.slice(0, lastSpace) : slice).trim()
  return `${clipped}…`
}
