import { useEffect, useState } from 'react'

export function useInViewOnce(elementId: string): boolean {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (visible) {
      return
    }

    const element = document.getElementById(elementId)
    if (element === null) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      {
        rootMargin: '240px 0px',
        threshold: 0,
      },
    )

    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [elementId, visible])

  return visible
}
