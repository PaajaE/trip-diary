import { describe, expect, it } from 'vitest'
import {
  createAutoOrganizer,
  type AutoRunContext,
  type AutoRunOutcome,
} from '@/features/journey-organize/model/auto-organize'

const COUNTS = {
  mediaReassigned: 3,
  momentsCreated: 1,
  momentsDeleted: 0,
  momentsExtended: 0,
  momentsUpdated: 0,
  segmentsDeleted: 0,
  stagesCreated: 0,
  tripsCreated: 0,
}

/** Manual timers: `tick()` fires everything that is due. */
function manualTimers() {
  let pending: { callback: () => void; id: number }[] = []
  let next = 0
  return {
    count: () => pending.length,
    schedule: (callback: () => void) => {
      const id = (next += 1)
      pending.push({ callback, id })
      return () => {
        pending = pending.filter((entry) => entry.id !== id)
      }
    },
    tick: () => {
      const due = pending
      pending = []
      for (const entry of due) entry.callback()
    },
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('createAutoOrganizer', () => {
  it('debounces requests into one run with all new ids', async () => {
    const timers = manualTimers()
    const runs: string[][] = []
    const organizer = createAutoOrganizer({
      run: (_journey, ids, context) => {
        runs.push([...ids])
        const outcome: AutoRunOutcome = {
          counts: COUNTS,
          createdMomentIds: ['m1'],
          kind: 'applied',
        }
        context.onApplied(outcome)
        return Promise.resolve(outcome)
      },
      schedule: timers.schedule,
    })
    organizer.request('j', ['a'])
    organizer.request('j', ['b', 'a'])
    expect(organizer.getState('j')).toEqual({
      exclusive: false,
      queued: true,
      status: 'idle',
    })
    expect(timers.count()).toBe(1)
    timers.tick()
    await organizer.settled('j')
    expect(runs).toEqual([['a', 'b']])
    expect(organizer.getState('j')).toMatchObject({
      counts: COUNTS,
      createdMomentIds: ['m1'],
      nothingNew: false,
      resolvingPlaces: false,
      runSeq: 1,
      status: 'done',
    })
  })

  it('skips ids it has already handed over (nothing new)', async () => {
    const timers = manualTimers()
    let runs = 0
    const organizer = createAutoOrganizer({
      run: () => {
        runs += 1
        return Promise.resolve({ kind: 'nothing' })
      },
      schedule: timers.schedule,
    })
    organizer.request('j', ['a'])
    timers.tick()
    await organizer.settled('j')
    organizer.request('j', ['a'])
    expect(timers.count()).toBe(0)
    expect(runs).toBe(1)
    expect(organizer.getState('j')).toMatchObject({
      nothingNew: true,
      status: 'done',
    })
  })

  it('never runs twice at once: a request during a run runs after it', async () => {
    const timers = manualTimers()
    const gates = [deferred<AutoRunOutcome>(), deferred<AutoRunOutcome>()]
    const contexts: AutoRunContext[] = []
    const runs: string[][] = []
    let active = 0
    let maxActive = 0
    const organizer = createAutoOrganizer({
      run: async (_journey, ids, context) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        contexts.push(context)
        runs.push([...ids])
        const outcome = await (gates[runs.length - 1]?.promise ??
          Promise.resolve<AutoRunOutcome>({ kind: 'nothing' }))
        active -= 1
        return outcome
      },
      schedule: timers.schedule,
    })
    organizer.request('j', ['a'])
    timers.tick()
    expect(organizer.getState('j').status).toBe('running')
    organizer.request('j', ['b'])
    // The running one is asked to stop its place lookup.
    expect(contexts[0]?.stopped()).toBe(true)
    timers.tick() // debounce of 'b' fires while 'a' still runs
    expect(runs).toEqual([['a']])
    gates[0]?.resolve({ kind: 'nothing' })
    await organizer.settled('j')
    expect(organizer.getState('j').queued).toBe(true)
    timers.tick()
    gates[1]?.resolve({ kind: 'nothing' })
    await organizer.settled('j')
    expect(runs).toEqual([['a'], ['b']])
    expect(maxActive).toBe(1)
    expect(contexts[1]?.stopped()).toBe(false)
  })

  it('keeps journeys apart', async () => {
    const timers = manualTimers()
    const seen: string[] = []
    const organizer = createAutoOrganizer({
      run: (journey) => {
        seen.push(journey)
        return Promise.resolve({ kind: 'nothing' })
      },
      schedule: timers.schedule,
    })
    organizer.request('j1', ['a'])
    organizer.request('j2', ['a'])
    timers.tick()
    await organizer.settled('j1')
    await organizer.settled('j2')
    expect(seen.sort()).toEqual(['j1', 'j2'])
  })

  it('reports "done" right after the write while places are still resolving', async () => {
    const timers = manualTimers()
    const places = deferred<AutoRunOutcome>()
    const organizer = createAutoOrganizer({
      run: (_journey, _ids, context) => {
        context.onApplied({
          counts: COUNTS,
          createdMomentIds: [],
          kind: 'applied',
        })
        return places.promise
      },
      schedule: timers.schedule,
    })
    organizer.request('j', ['a'])
    timers.tick()
    expect(organizer.getState('j')).toMatchObject({
      resolvingPlaces: true,
      status: 'done',
    })
    places.resolve({ counts: COUNTS, createdMomentIds: [], kind: 'applied' })
    await organizer.settled('j')
    expect(organizer.getState('j')).toMatchObject({
      resolvingPlaces: false,
      status: 'done',
    })
  })

  it('exposes a failure with what was written', async () => {
    const timers = manualTimers()
    const error = new Error('boom')
    const organizer = createAutoOrganizer({
      run: () =>
        Promise.resolve({
          counts: COUNTS,
          createdMomentIds: [],
          error,
          kind: 'failed',
        }),
      schedule: timers.schedule,
    })
    organizer.request('j', ['a'])
    timers.tick()
    await organizer.settled('j')
    expect(organizer.getState('j')).toMatchObject({
      counts: COUNTS,
      error,
      status: 'error',
    })
  })

  it('turns a thrown run into an error state', async () => {
    const timers = manualTimers()
    const organizer = createAutoOrganizer({
      run: () => Promise.reject(new Error('crash')),
      schedule: timers.schedule,
    })
    organizer.request('j', ['a'])
    timers.tick()
    await organizer.settled('j')
    expect(organizer.getState('j').status).toBe('error')
  })

  it('retries the media of a failed run with the next trigger', async () => {
    const timers = manualTimers()
    const runs: string[][] = []
    let fail = true
    const organizer = createAutoOrganizer({
      run: (_journey, ids) => {
        runs.push([...ids])
        return Promise.resolve(
          fail
            ? {
                counts: COUNTS,
                createdMomentIds: [],
                error: new Error('offline'),
                kind: 'failed' as const,
              }
            : { kind: 'nothing' as const },
        )
      },
      schedule: timers.schedule,
    })
    organizer.request('j', ['a', 'b'])
    timers.tick()
    await organizer.settled('j')
    expect(organizer.getState('j')).toMatchObject({
      retryCount: 2,
      status: 'error',
    })
    // The same ids again are not "seen": they were never organised.
    fail = false
    organizer.request('j', ['c'])
    timers.tick()
    await organizer.settled('j')
    expect(runs).toEqual([
      ['a', 'b'],
      ['c', 'a', 'b'],
    ])
    expect(organizer.getState('j').status).toBe('done')
  })

  it('keeps media that were not ready for the next trigger', async () => {
    const timers = manualTimers()
    const runs: string[][] = []
    const organizer = createAutoOrganizer({
      run: (_journey, ids) => {
        runs.push([...ids])
        return Promise.resolve({
          kind: 'nothing' as const,
          unreadyIds: runs.length === 1 ? ['video'] : [],
        })
      },
      schedule: timers.schedule,
    })
    organizer.request('j', ['photo', 'video'])
    timers.tick()
    await organizer.settled('j')
    organizer.request('j', ['photo']) // handled: nothing new
    expect(timers.count()).toBe(0)
    organizer.request('j', ['next'])
    timers.tick()
    await organizer.settled('j')
    expect(runs).toEqual([
      ['photo', 'video'],
      ['next', 'video'],
    ])
  })

  it('runs an exclusive task alone: it waits for a run and blocks the debounce', async () => {
    const timers = manualTimers()
    const gate = deferred<AutoRunOutcome>()
    const order: string[] = []
    let stoppedSeen = false
    const organizer = createAutoOrganizer({
      run: async (_journey, ids, context) => {
        order.push(`run:${ids.join(',')}:start`)
        const outcome = await gate.promise
        stoppedSeen = context.stopped()
        order.push(`run:${ids.join(',')}:end`)
        return outcome
      },
      schedule: timers.schedule,
    })
    organizer.request('j', ['a'])
    timers.tick()
    const undoGate = deferred<string>()
    const undo = organizer.exclusive('j', async () => {
      order.push('undo:start')
      const value = await undoGate.promise
      order.push('undo:end')
      return value
    })
    expect(organizer.getState('j').exclusive).toBe(true)
    // A trigger during the undo: no timer fires a run meanwhile.
    organizer.request('j', ['b'])
    gate.resolve({ kind: 'nothing' })
    await Promise.resolve()
    await new Promise((done) => setTimeout(done, 0))
    timers.tick()
    expect(order).toEqual(['run:a:start', 'run:a:end', 'undo:start'])
    expect(stoppedSeen).toBe(true) // the place lookup was asked to stop
    undoGate.resolve('ok')
    expect(await undo).toBe('ok')
    expect(organizer.getState('j').exclusive).toBe(false)
    timers.tick() // re-armed after the undo
    await organizer.settled('j')
    expect(order).toEqual([
      'run:a:start',
      'run:a:end',
      'undo:start',
      'undo:end',
      'run:b:start',
      'run:b:end',
    ])
  })
})
