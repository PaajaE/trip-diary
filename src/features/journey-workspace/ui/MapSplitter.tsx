import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidthBounds } from '@/features/journey-workspace/lib/workspace-layout'
import { cn } from '@/shared/lib/cn'

const STEP = 24
const STEP_BIG = 80

/**
 * Vertical splitter between the day cards and the map panel. Dragging left
 * widens the map; the arrow keys do the same for keyboard users.
 */
export function MapSplitter({
  bounds,
  onReset,
  onResize,
  rowWidth,
  width,
}: {
  bounds: WidthBounds
  onReset: () => void
  /** `snap` is true while dragging, so the width sticks to 1/3 and 1/2. */
  onResize: (width: number, snap: boolean) => void
  rowWidth: number
  width: number
}) {
  const { t } = useTranslation()
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ w: number; x: number } | null>(null)
  const percent = (value: number) => Math.round((value / rowWidth) * 100)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? STEP_BIG : STEP
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = width + step
    else if (event.key === 'ArrowRight') next = width - step
    else if (event.key === 'Home') next = bounds.min
    else if (event.key === 'End') next = bounds.max
    if (next === null) return
    event.preventDefault()
    onResize(next, false)
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { w: width, x: event.clientX }
    setDragging(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return
    onResize(start.current.w - (event.clientX - start.current.x), true)
  }
  const endDrag = () => {
    start.current = null
    setDragging(false)
  }

  return (
    // A focusable separator is the WAI-ARIA pattern for a window splitter.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      aria-label={t('workspace.layout.mapWidth')}
      aria-orientation="vertical"
      aria-valuemax={percent(bounds.max)}
      aria-valuemin={percent(bounds.min)}
      aria-valuenow={percent(width)}
      className={cn(
        'relative flex cursor-col-resize touch-none justify-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
        dragging && 'bg-primary-soft',
      )}
      role="separator"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      title={t('workspace.layout.mapWidthHint')}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-[6px] w-px bg-border"
      />
      {/* The row is as tall as the whole journey: keep the grip in view. */}
      <span className="sticky top-[calc(5rem+env(safe-area-inset-top))] flex h-[calc(100svh-6rem-env(safe-area-inset-top))] items-center">
        <span
          aria-hidden="true"
          className={cn(
            'relative h-11 w-1.5 rounded-full border border-border',
            dragging ? 'bg-primary' : 'bg-surface',
          )}
        />
        {dragging ? (
          <span className="absolute right-[18px] top-1/2 z-10 -translate-y-1/2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-semibold text-background">
            {t('workspace.layout.mapPercent', { percent: percent(width) })}
          </span>
        ) : null}
      </span>
    </div>
  )
}
