/**
 * What each step of the day sorting writes, and how Undo takes it back.
 * Every step is one logical change; a step of two writes rolls its first
 * write back when the second fails, so a failure never leaves half a step
 * (no ★ on a photo that is not kept, never ★ and trash together).
 */
import type { FlowActions } from '@/features/journey-flow/api/flow-actions'
import type { SortAction } from '@/features/media-batch/model/quick-sort'

export type SortWriteActions = Pick<
  FlowActions,
  'restorePhotos' | 'sortPhotos' | 'starPhotos' | 'trashPhotos'
>

/** Runs `second` after `first`; undoes `first` when `second` fails. */
async function both(
  first: (() => Promise<unknown>) | null,
  second: () => Promise<unknown>,
  undoFirst: () => Promise<unknown>,
): Promise<void> {
  if (first === null) {
    await second()
    return
  }
  await first()
  try {
    await second()
  } catch (error) {
    await undoFirst().catch(() => undefined)
    throw error
  }
}

/**
 * The write of a step. `starred` on a trash step: the photo had ★, which
 * comes off first (a trashed photo is never a ★ pick); on a best step: ★
 * goes on with it.
 */
export function writeOf(
  step: Pick<SortAction, 'ids' | 'starred' | 'type'>,
  actions: SortWriteActions,
): Promise<void> {
  const ids = [...step.ids]
  switch (step.type) {
    case 'trash':
      return both(
        step.starred === true ? () => actions.starPhotos(ids, false) : null,
        () => actions.trashPhotos(ids),
        () => actions.starPhotos(ids, true),
      )
    case 'best':
      return both(
        step.starred === true ? () => actions.starPhotos(ids, true) : null,
        () => actions.sortPhotos(ids),
        () => actions.starPhotos(ids, false),
      )
    case 'star':
    case 'unstar':
      return actions.starPhotos(ids, step.type === 'star')
    case 'done':
    case 'moveTo':
    case 'newStop':
      return actions.sortPhotos(ids).then(() => undefined)
  }
}

/** Undo of a step that was saved. */
export function revertOf(
  step: Pick<SortAction, 'ids' | 'starred' | 'type'>,
  actions: SortWriteActions,
): Promise<void> {
  const ids = [...step.ids]
  switch (step.type) {
    case 'trash':
      return both(
        () => actions.restorePhotos(ids),
        () =>
          step.starred === true
            ? actions.starPhotos(ids, true)
            : Promise.resolve(),
        () => actions.trashPhotos(ids),
      )
    case 'best':
      return both(
        () => actions.sortPhotos(ids, false),
        () =>
          step.starred === true
            ? actions.starPhotos(ids, false)
            : Promise.resolve(),
        () => actions.sortPhotos(ids),
      )
    case 'star':
    case 'unstar':
      return actions.starPhotos(ids, step.type === 'unstar')
    case 'done':
    case 'moveTo':
    case 'newStop':
      return actions.sortPhotos(ids, false).then(() => undefined)
  }
}

/** ★ as the session shows it: the last step that touched it wins. */
export function starOverrides(
  history: readonly Pick<SortAction, 'ids' | 'starred' | 'type'>[],
): Map<string, boolean> {
  const out = new Map<string, boolean>()
  for (const action of history) {
    for (const id of action.ids) {
      if (action.type === 'star') out.set(id, true)
      else if (action.type === 'unstar') out.set(id, false)
      else if (action.type === 'best' && action.starred === true)
        out.set(id, true)
      else if (action.type === 'trash' && action.starred === true)
        out.set(id, false)
    }
  }
  return out
}
