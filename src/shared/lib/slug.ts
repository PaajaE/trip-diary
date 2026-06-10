import { z } from 'zod'

export const publicSlugSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/)

export function createPublicSlug(title: string, id: string): string {
  const normalized = title
    .trim()
    .toLocaleLowerCase('cs')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 68)
    .replace(/-+$/g, '')
  const prefix = normalized.length >= 3 ? normalized : 'zazitek'
  return publicSlugSchema.parse(
    `${prefix}-${id.replaceAll('-', '').slice(0, 8)}`,
  )
}
