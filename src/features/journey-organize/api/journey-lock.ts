/**
 * One structural writer per journey: automatic organize, the manual
 * "Uspořádat automaticky" and "Vrátit uspořádání" all run under this lock.
 * In-process the tasks of a journey are chained (single-flight); across tabs
 * the Web Locks API (`navigator.locks`) holds the same named lock. Without
 * Web Locks (old WebKit, tests) only the in-process chain applies.
 */

const chains = new Map<string, Promise<unknown>>()

export const JOURNEY_LOCK_PREFIX = 'trip-diary:organize:'

interface LockManagerLike {
  request: <T>(name: string, callback: () => Promise<T>) => Promise<T>
}

function lockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return null
  const locks = (navigator as { locks?: Partial<LockManagerLike> }).locks
  return typeof locks?.request === 'function'
    ? (locks as LockManagerLike)
    : null
}

/** Runs `task` once no other structural task of the journey runs (any tab). */
export function withJourneyLock<T>(
  journeyId: string,
  task: () => Promise<T>,
  locks: LockManagerLike | null = lockManager(),
): Promise<T> {
  const previous = chains.get(journeyId) ?? Promise.resolve()
  const run = previous
    .catch(() => undefined)
    .then(() =>
      locks === null
        ? task()
        : locks.request(`${JOURNEY_LOCK_PREFIX}${journeyId}`, task),
    )
  chains.set(journeyId, run)
  const release = () => {
    if (chains.get(journeyId) === run) chains.delete(journeyId)
  }
  void run.then(release, release)
  return run
}
