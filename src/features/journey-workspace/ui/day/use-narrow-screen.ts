import { useEffect, useState } from 'react'

/** True below the 760 px breakpoint; false where matchMedia is missing. */
export function useNarrowScreen(): boolean {
  const query = '(max-width: 759px)'
  const [narrow, setNarrow] = useState(
    () =>
      typeof window.matchMedia === 'function' &&
      window.matchMedia(query).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = () => {
      setNarrow(list.matches)
    }
    list.addEventListener('change', update)
    return () => {
      list.removeEventListener('change', update)
    }
  }, [])
  return narrow
}
