import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { setJourneyCover } from '@/entities/journey/api/journey-cover.repository'
import { updateMediaMeta } from '@/entities/media/api/media-library.repository'
import { mediaQueryKeys } from '@/entities/media/api/media-query-keys'
import type { MediaItem } from '@/entities/media/model/media-library'
import { momentQueryKeys } from '@/entities/moment/api/moment-query-keys'
import {
  mergeMoments,
  splitMoment,
  updateMoment,
} from '@/entities/moment/api/moment.repository'
import type { Moment } from '@/entities/moment/model/moment'
import { segmentQueryKeys } from '@/entities/segment/api/segment-query-keys'
import {
  acceptSuggestedSegment,
  moveSegmentBoundary,
  rejectSuggestedSegment,
  restoreSuggestedSegment,
  updateSegment,
} from '@/entities/segment/api/segment.repository'
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

export interface SegmentText {
  body: string
  title: string
}

export interface MomentText {
  body: string
  title: string | null
}

export interface WorkspaceEdits {
  acceptSegment: (segment: Segment) => Promise<boolean>
  /** Moves the shared edge of two adjacent segments; Undo moves it back. */
  moveBoundary: (
    before: Segment,
    after: Segment,
    at: string,
  ) => Promise<boolean>
  /** Folds source into target. Not undoable (the source title/body are lost). */
  mergeMoments: (targetId: string, sourceId: string) => Promise<boolean>
  rejectSegment: (segment: Segment) => Promise<boolean>
  /** Validates, then saves; returns the validation failure without saving. */
  saveCaption: (item: MediaItem, raw: string) => Promise<CaptionResult>
  /** Splits at the instant; Undo merges the new moment back. */
  splitMoment: (momentId: string, at: string) => Promise<boolean>
  /** Saves already-normalized texts; Undo restores the previous ones. */
  saveMomentText: (moment: Moment, text: MomentText) => Promise<boolean>
  saveSegmentText: (segment: Segment, text: SegmentText) => Promise<boolean>
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

    function segmentOrigin(
      segmentId: string,
      origin: Segment['origin'],
    ): () => void {
      return optimisticUpdate<Segment[]>(
        queryClient,
        segmentQueryKeys.journey(journeyId),
        (list) => patchListItem(list, segmentId, { origin }),
      )
    }

    return {
      acceptSegment: (segment) =>
        run({
          apply: () => acceptSuggestedSegment(segment.id),
          errorMessage,
          optimistic: (direction) =>
            segmentOrigin(
              segment.id,
              direction === 'apply' ? 'accepted' : 'suggested',
            ),
          successMessage: t('workspace.segmentAccepted'),
          undo: () => restoreSuggestedSegment(segment.id),
        }),
      mergeMoments: (targetId, sourceId) =>
        run({
          apply: () => mergeMoments(targetId, sourceId),
          errorMessage,
          successMessage: t('workspace.momentsMerged'),
        }),
      moveBoundary: (before, after, at) => {
        const oldAt = before.endsAt
        return run({
          apply: () => moveSegmentBoundary(before.id, after.id, at),
          errorMessage,
          successMessage: t('workspace.boundaryMoved'),
          undo: () => moveSegmentBoundary(before.id, after.id, oldAt),
        })
      },
      rejectSegment: (segment) =>
        run({
          apply: () => rejectSuggestedSegment(segment.id),
          errorMessage,
          optimistic: (direction) =>
            direction === 'apply'
              ? optimisticUpdate<Segment[]>(
                  queryClient,
                  segmentQueryKeys.journey(journeyId),
                  (list) => list.filter((s) => s.id !== segment.id),
                )
              : () => undefined,
          successMessage: t('workspace.segmentRejected'),
          undo: () => restoreSuggestedSegment(segment.id),
        }),
      splitMoment: (momentId, at) => {
        const newId = crypto.randomUUID()
        return run({
          apply: () => splitMoment(momentId, at, newId),
          errorMessage,
          successMessage: t('workspace.momentSplit'),
          undo: () => mergeMoments(momentId, newId),
        })
      },
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
      saveMomentText: (moment, text) => {
        const previous: MomentText = { body: moment.body, title: moment.title }
        const cache = (value: MomentText): (() => void) =>
          optimisticUpdate<Moment[]>(
            queryClient,
            momentQueryKeys.journey(journeyId),
            (list) => patchListItem(list, moment.id, value),
          )
        return run({
          apply: () => updateMoment(moment.id, text),
          errorMessage,
          optimistic: (direction) =>
            cache(direction === 'apply' ? text : previous),
          successMessage: t('workspace.textSaved'),
          undo: () => updateMoment(moment.id, previous),
        })
      },
      saveSegmentText: (segment, text) => {
        const previous: SegmentText = {
          body: segment.body,
          title: segment.title,
        }
        const cache = (value: SegmentText): (() => void) =>
          optimisticUpdate<Segment[]>(
            queryClient,
            segmentQueryKeys.journey(journeyId),
            (list) => patchListItem(list, segment.id, value),
          )
        return run({
          apply: () => updateSegment(segment.id, text),
          errorMessage,
          optimistic: (direction) =>
            cache(direction === 'apply' ? text : previous),
          successMessage: t('workspace.textSaved'),
          undo: () => updateSegment(segment.id, previous),
        })
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
