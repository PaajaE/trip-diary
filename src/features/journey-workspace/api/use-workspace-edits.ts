import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { setJourneyCover } from '@/entities/journey/api/journey-cover.repository'
import { updateMediaMeta } from '@/entities/media/api/media-library.repository'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import type { MediaItem } from '@/entities/media/model/media-library'
import { momentQueryKeys } from '@/entities/moment/api/moment-query-keys'
import { updateMoment } from '@/entities/moment/api/moment.repository'
import type { Moment } from '@/entities/moment/model/moment'
import { segmentQueryKeys } from '@/entities/segment/api/segment-query-keys'
import { updateSegment } from '@/entities/segment/api/segment.repository'
import type { Segment } from '@/entities/segment/model/segment'
import {
  normalizeCaption,
  type CaptionResult,
} from '@/features/journey-workspace/lib/caption'
import {
  optimisticUpdate,
  patchListItem,
} from '@/features/journey-workspace/lib/optimistic-cache'
import { useUndoableMutation } from '@/features/journey-workspace/lib/use-undoable-mutation'
import type { CoverTarget } from '@/features/journey-workspace/model/cover-targets'

export interface WorkspaceEdits {
  /** Validates, then saves; returns the validation failure without saving. */
  saveCaption: (item: MediaItem, raw: string) => Promise<CaptionResult>
  setCover: (mediaId: string, target: CoverTarget) => Promise<boolean>
  toggleStar: (item: MediaItem) => Promise<boolean>
}

export function useWorkspaceEdits(journeyId: string): WorkspaceEdits {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const run = useUndoableMutation(journeyId, {
    undo: t('workspace.undo'),
    undoFailed: t('workspace.undoFailed'),
    undone: t('workspace.undone'),
  })

  return useMemo<WorkspaceEdits>(() => {
    const errorMessage = t('workspace.saveFailed')

    function mediaPatch(
      mediaId: string,
      patch: Partial<MediaItem>,
    ): () => void {
      return optimisticUpdate<MediaItem[]>(
        queryClient,
        mediaQueryKeys.journey(journeyId),
        (list) => patchListItem(list, mediaId, patch),
      )
    }

    return {
      saveCaption: async (item, raw) => {
        const result = normalizeCaption(raw)
        if (!result.ok || result.value === item.caption) return result
        const next = result.value
        const previous = item.caption
        await run({
          apply: () => updateMediaMeta(item.id, { caption: next }),
          errorMessage,
          optimistic: (direction) =>
            mediaPatch(item.id, {
              caption: direction === 'apply' ? next : previous,
            }),
          successMessage: t('workspace.captionSaved'),
          undo: () => updateMediaMeta(item.id, { caption: previous }),
        })
        return result
      },
      setCover: (mediaId, target) => {
        const previous = target.currentCoverId
        const write = (value: string | null): Promise<unknown> => {
          if (target.level === 'journey') {
            return setJourneyCover(target.targetId, value)
          }
          if (target.level === 'moment') {
            return updateMoment(target.targetId, { coverMediaId: value })
          }
          return updateSegment(target.targetId, { coverMediaId: value })
        }
        const cache = (value: string | null): (() => void) => {
          if (target.level === 'journey') {
            return optimisticUpdate<string | null>(
              queryClient,
              journeyQueryKeys.cover(journeyId),
              () => value,
            )
          }
          if (target.level === 'moment') {
            return optimisticUpdate<Moment[]>(
              queryClient,
              momentQueryKeys.journey(journeyId),
              (list) =>
                patchListItem(list, target.targetId, { coverMediaId: value }),
            )
          }
          return optimisticUpdate<Segment[]>(
            queryClient,
            segmentQueryKeys.journey(journeyId),
            (list) =>
              patchListItem(list, target.targetId, { coverMediaId: value }),
          )
        }
        return run({
          apply: () => write(mediaId),
          errorMessage,
          invalidate: () =>
            queryClient.invalidateQueries({
              queryKey: journeyQueryKeys.cover(journeyId),
            }),
          optimistic: (direction) =>
            cache(direction === 'apply' ? mediaId : previous),
          successMessage: t('workspace.coverSet'),
          undo: () => write(previous),
        })
      },
      toggleStar: (item) => {
        const next = !item.starred
        const previous = item.starred
        return run({
          apply: () => updateMediaMeta(item.id, { starred: next }),
          errorMessage,
          optimistic: (direction) =>
            mediaPatch(item.id, {
              starred: direction === 'apply' ? next : previous,
            }),
          successMessage: t(next ? 'workspace.starred' : 'workspace.unstarred'),
          undo: () => updateMediaMeta(item.id, { starred: previous }),
        })
      },
    }
  }, [journeyId, queryClient, run, t])
}
