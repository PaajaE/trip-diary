import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

interface MosaicGridProps {
  /** Up to three cells: a big one on the left, two stacked on the right. */
  cells: readonly ReactNode[]
  className?: string | undefined
  /** Shown when there is no cell. */
  empty: ReactNode
  /** Badge ("+14") on the last visible cell. */
  more?: number
  testId?: string
}

const CELL = 'relative block min-h-0 min-w-0 overflow-hidden'

/**
 * Photo mosaic of the editor day card and the public day/stage card: always a
 * 16:10 box (never a low strip), 2/1/1 with three photos, 2/1 with two.
 */
export function MosaicGrid({
  cells,
  className,
  empty,
  more = 0,
  testId,
}: MosaicGridProps) {
  const [hero, second, third] = cells
  if (hero === undefined) {
    return (
      <span
        className={cn(
          'flex aspect-[16/10] items-center justify-center bg-sunk text-faint',
          className,
        )}
        data-testid={testId}
      >
        {empty}
      </span>
    )
  }
  const badge =
    more > 0 ? (
      <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
        {`+${String(more)}`}
      </span>
    ) : null
  const last = third === undefined ? (second === undefined ? 0 : 1) : 2
  return (
    <span
      className={cn(
        'grid aspect-[16/10] gap-0.5 bg-sunk',
        second === undefined
          ? 'grid-cols-1'
          : 'grid-cols-[2fr_1fr] grid-rows-2',
        className,
      )}
      data-testid={testId}
    >
      <span className={cn(CELL, second !== undefined && 'row-span-2')}>
        {hero}
        {last === 0 ? badge : null}
      </span>
      {second === undefined ? null : (
        <span className={cn(CELL, third === undefined && 'row-span-2')}>
          {second}
          {last === 1 ? badge : null}
        </span>
      )}
      {third === undefined ? null : (
        <span className={CELL}>
          {third}
          {badge}
        </span>
      )}
    </span>
  )
}
