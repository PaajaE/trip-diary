export function normalizePhotoTagSlug(label: string): string {
  const normalized = label
    .trim()
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40)

  return normalized.length >= 2 ? normalized : 'tag'
}
