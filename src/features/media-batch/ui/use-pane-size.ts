import { useLayoutEffect, useState, type RefObject } from 'react'
import type { Size } from '@/features/media-batch/model/zoom'

/** Size of an element, kept up to date with a ResizeObserver. */
export function usePaneSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ h: 0, w: 0 })
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return
    const read = () => {
      const rect = node.getBoundingClientRect()
      setSize((prev) =>
        prev.w === rect.width && prev.h === rect.height
          ? prev
          : { h: rect.height, w: rect.width },
      )
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [ref])
  return size
}
