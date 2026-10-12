import type { TFunction } from 'i18next'
import type { Tag } from '@/entities/tag/model/tag'

/** Fixed categories are translated by slug; other tags show their own label. */
export function tagDisplayLabel(tag: Tag, t: TFunction): string {
  if (tag.kind !== 'category') return tag.label
  return t(`tags.category.${tag.slug}`, { defaultValue: tag.label })
}
