import { useEffect, useState } from 'react'

/**
 * Id of the section (out of `ids`, in page order) that is being read: the
 * first one crossing the band near the top of the viewport. Without
 * IntersectionObserver (old browsers, jsdom) the first id stays active.
 */
export function useScrollSpy(
  ids: readonly string[],
  rootMargin = '-20% 0px -60% 0px',
): [string, (id: string) => void] {
  const [active, setActive] = useState(ids[0] ?? '')
  const key = ids.join('|')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = ids.find((id) => visible.has(id))
        if (first !== undefined) {
          setActive(first)
        } else if (
          (document.getElementById(ids[0] ?? '')?.getBoundingClientRect().top ??
            0) > 0
        ) {
          // Above the first section (the cover): the first one is "next".
          setActive(ids[0] ?? '')
        }
      },
      { rootMargin },
    )
    for (const id of ids) {
      const element = document.getElementById(id)
      if (element !== null) observer.observe(element)
    }
    return () => {
      observer.disconnect()
    }
    // `key` stands for the id list (a new array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rootMargin])
  return [active, setActive]
}

/** Smooth scroll to an element id, instant when the user prefers less motion. */
export function scrollToId(id: string): boolean {
  const target = document.getElementById(id)
  if (target === null) return false
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({
    behavior: reduce ? 'auto' : 'smooth',
    block: 'start',
  })
  return true
}
