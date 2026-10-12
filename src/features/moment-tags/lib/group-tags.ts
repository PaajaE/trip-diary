import type { MomentTagData } from '@/entities/tag/api/use-moment-tags-query'
import type { Tag } from '@/entities/tag/model/tag'

const KIND_ORDER = { category: 0, free: 1, species: 2 } as const

/** Tags per moment: categories first, then free tags, then species; by label. */
export function groupTagsByMoment(
  data: MomentTagData | undefined,
): Map<string, Tag[]> {
  const byId = new Map((data?.tags ?? []).map((tag) => [tag.id, tag]))
  const result = new Map<string, Tag[]>()
  for (const { momentId, tagId } of data?.taggings ?? []) {
    const tag = byId.get(tagId)
    if (tag === undefined) continue
    const list = result.get(momentId) ?? []
    list.push(tag)
    result.set(momentId, list)
  }
  for (const list of result.values()) {
    list.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.label.localeCompare(b.label),
    )
  }
  return result
}

/** Cache update that attaches a tag (adds the tag row when unknown). */
export function withTagging(
  data: MomentTagData,
  momentId: string,
  tag: Tag,
): MomentTagData {
  if (data.taggings.some((t) => t.momentId === momentId && t.tagId === tag.id))
    return data
  return {
    taggings: [...data.taggings, { momentId, tagId: tag.id }],
    tags: data.tags.some((t) => t.id === tag.id)
      ? data.tags
      : [...data.tags, tag],
  }
}

export function withoutTagging(
  data: MomentTagData,
  momentId: string,
  tagId: string,
): MomentTagData {
  return {
    ...data,
    taggings: data.taggings.filter(
      (t) => !(t.momentId === momentId && t.tagId === tagId),
    ),
  }
}
