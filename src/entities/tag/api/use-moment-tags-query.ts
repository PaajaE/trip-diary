import { useQuery } from '@tanstack/react-query'
import {
  listMomentTaggings,
  listTagCatalog,
  listTagsByIds,
} from '@/entities/tag/api/tag.repository'
import { tagQueryKeys } from '@/entities/tag/api/tag-query-keys'
import type { MomentTagging, Tag } from '@/entities/tag/model/tag'

export interface MomentTagData {
  taggings: MomentTagging[]
  tags: Tag[]
}

async function loadMomentTagData(momentIds: string[]): Promise<MomentTagData> {
  const taggings = await listMomentTaggings(momentIds)
  const tags = await listTagsByIds(taggings.map((row) => row.tagId))
  return { taggings, tags }
}

/** Taggings of the given moments with their tags. Key follows the id set. */
export function useMomentTagsQuery(journeyId: string, momentIds: string[]) {
  return useQuery({
    enabled: momentIds.length > 0,
    queryFn: () => loadMomentTagData(momentIds),
    queryKey: tagQueryKeys.moments(journeyId, momentIds),
  })
}

/** Categories plus the user's recent free tags (suggestions in the picker). */
export function useTagCatalogQuery(userId: string | undefined) {
  return useQuery({
    enabled: userId !== undefined,
    queryFn: () => listTagCatalog(userId ?? ''),
    queryKey: tagQueryKeys.catalog(userId ?? ''),
  })
}
