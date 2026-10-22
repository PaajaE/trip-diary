import { useCallback, useState } from 'react'

export interface DaySelection {
  clear: () => void
  has: (id: string) => boolean
  ids: ReadonlySet<string>
  /** Selection mode: on while something is selected or after "Select photos". */
  mode: boolean
  setMode: (on: boolean) => void
  /** Adds (`on`) or removes every given id, e.g. "select the whole day". */
  setMany: (ids: readonly string[], on: boolean) => void
  /** Toggles one id; with `range` also everything between the last toggled id and it. */
  toggle: (id: string, order: readonly string[], range: boolean) => void
}

/** Photo selection of the day; `order` is the flat visual order of ids. */
export function useDaySelection(): DaySelection {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [forced, setMode] = useState(false)

  const clear = useCallback(() => {
    setIds(new Set())
    setAnchor(null)
    setMode(false)
  }, [])

  const toggle = useCallback(
    (id: string, order: readonly string[], range: boolean) => {
      setIds((current) => {
        const next = new Set(current)
        const from = anchor === null ? -1 : order.indexOf(anchor)
        const to = order.indexOf(id)
        if (range && from >= 0 && to >= 0) {
          const [a, b] = from < to ? [from, to] : [to, from]
          for (const between of order.slice(a, b + 1)) next.add(between)
        } else if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      setAnchor(id)
    },
    [anchor],
  )

  const setMany = useCallback((many: readonly string[], on: boolean) => {
    setIds((current) => {
      const next = new Set(current)
      for (const id of many) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
    setAnchor(null)
  }, [])

  const has = useCallback((id: string) => ids.has(id), [ids])
  return {
    clear,
    has,
    ids,
    mode: forced || ids.size > 0,
    setMany,
    setMode,
    toggle,
  }
}
