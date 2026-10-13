import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  speciesLabel,
  type SpeciesSuggestion,
} from '@/entities/tag/api/gbif-species'
import {
  addMomentTag,
  findOrCreateTag,
  removeMomentTag,
} from '@/entities/tag/api/tag.repository'
import { tagQueryKeys } from '@/entities/tag/api/tag-query-keys'
import {
  useMomentTagsQuery,
  useTagCatalogQuery,
  type MomentTagData,
} from '@/entities/tag/api/use-moment-tags-query'
import {
  normalizeTagLabel,
  slugifyTagLabel,
  speciesSlug,
  type Tag,
} from '@/entities/tag/model/tag'
import { useToast } from '@/shared/ui/use-toast'
import { useSession } from '@/features/auth/session/use-session'
import { optimisticUpdate } from '@/features/journey-workspace/lib/optimistic-cache'
import { useUndoableMutation } from '@/features/journey-workspace/lib/use-undoable-mutation'
import {
  groupTagsByMoment,
  withoutTagging,
  withTagging,
} from '@/features/moment-tags/lib/group-tags'

export interface MomentTagEdits {
  /** Creates (or reuses) the free tag and attaches it. False: invalid label or failure. */
  addFree: (momentId: string, rawLabel: string) => Promise<boolean>
  addSpecies: (momentId: string, species: SpeciesSuggestion) => Promise<boolean>
  /** Attaches a known tag, or detaches it when `attached`. */
  toggle: (momentId: string, tag: Tag, attached: boolean) => Promise<boolean>
}

export interface JourneyMomentTags {
  byMoment: Map<string, Tag[]>
  catalog: Tag[]
  edits: MomentTagEdits
  /** True when tags could not be loaded; the rest of the workspace still works. */
  loadFailed: boolean
}

export function useJourneyMomentTags(
  journeyId: string,
  momentIds: string[],
): JourneyMomentTags {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useSession()
  const userId = user?.id
  const { showToast } = useToast()
  const tagged = useMomentTagsQuery(journeyId, momentIds)
  const catalog = useTagCatalogQuery(userId)
  const run = useUndoableMutation(journeyId, {
    undo: t('workspace.undo'),
    undoFailed: t('workspace.undoFailed'),
    undone: t('workspace.undone'),
  })
  const key = tagQueryKeys.moments(journeyId, momentIds)
  const keyId = key.join('|')

  const byMoment = useMemo(() => groupTagsByMoment(tagged.data), [tagged.data])

  const edits = useMemo<MomentTagEdits>(() => {
    const errorMessage = t('tags.saveFailed')
    const cache = (update: (d: MomentTagData) => MomentTagData) =>
      optimisticUpdate<MomentTagData>(queryClient, key, update)
    const refresh = () =>
      queryClient.invalidateQueries({
        queryKey: tagQueryKeys.journey(journeyId),
      })

    function attach(momentId: string, tag: Tag): Promise<boolean> {
      return run({
        apply: () => addMomentTag(momentId, tag.id, userId ?? ''),
        errorMessage,
        invalidate: refresh,
        optimistic: (direction) =>
          cache((d) =>
            direction === 'apply'
              ? withTagging(d, momentId, tag)
              : withoutTagging(d, momentId, tag.id),
          ),
        successMessage: t('tags.added', { name: tag.label }),
        undo: () => removeMomentTag(momentId, tag.id),
      })
    }

    async function createAndAttach(
      momentId: string,
      draft: Parameters<typeof findOrCreateTag>[0],
    ): Promise<boolean> {
      let tag: Tag
      try {
        tag = await findOrCreateTag(draft)
      } catch {
        showToast({ message: errorMessage, variant: 'error' })
        return false
      }
      return attach(momentId, tag)
    }

    return {
      addFree: (momentId, rawLabel) => {
        const label = normalizeTagLabel(rawLabel)
        if (label === null || userId === undefined)
          return Promise.resolve(false)
        return createAndAttach(momentId, {
          createdBy: userId,
          kind: 'free',
          label,
          slug: slugifyTagLabel(label),
        })
      },
      addSpecies: (momentId, species) => {
        if (userId === undefined) return Promise.resolve(false)
        return createAndAttach(momentId, {
          createdBy: userId,
          gbifTaxonId: species.taxonKey,
          kind: 'species',
          label: speciesLabel(species),
          slug: speciesSlug(species.taxonKey),
        })
      },
      toggle: (momentId, tag, attached) =>
        attached
          ? run({
              apply: () => removeMomentTag(momentId, tag.id),
              errorMessage,
              invalidate: refresh,
              optimistic: (direction) =>
                cache((d) =>
                  direction === 'apply'
                    ? withoutTagging(d, momentId, tag.id)
                    : withTagging(d, momentId, tag),
                ),
              successMessage: t('tags.removed', { name: tag.label }),
              undo: () => addMomentTag(momentId, tag.id, userId ?? ''),
            })
          : attach(momentId, tag),
    }
    // `key` is derived from journeyId + momentIds; keyId is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, keyId, queryClient, run, showToast, t, userId])

  const catalogTags = catalog.data
  const loadFailed = tagged.isError
  return useMemo(
    () => ({ byMoment, catalog: catalogTags ?? [], edits, loadFailed }),
    [byMoment, catalogTags, edits, loadFailed],
  )
}
