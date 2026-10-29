import { useTranslation } from 'react-i18next'
import {
  scrollToId,
  useScrollSpy,
} from '@/features/public-journey/lib/use-scroll-spy'
import { cn } from '@/shared/lib/cn'

export interface DayRailItem {
  id: string
  /** "Út 22. 7." */
  label: string
  /** Day number on the journey ("2"). */
  number: number
}

interface DayRailProps {
  items: readonly DayRailItem[]
  /** `rail`: sticky list in the left column; `chips`: sticky row (mobile). */
  variant: 'chips' | 'rail'
}

/** Navigation across the days of a stage; follows the day being read. */
export function DayRail({ items, variant }: DayRailProps) {
  const { t } = useTranslation()
  const [active, setActive] = useScrollSpy(items.map((item) => item.id))
  if (items.length < 2) return null
  const chips = variant === 'chips'
  return (
    <nav
      aria-label={t('publicJourney.daysNav')}
      className={
        chips
          ? 'sticky top-[var(--reader-bar-h)] z-20 -mx-5 border-b border-border bg-background/90 px-5 py-2 backdrop-blur min-[1000px]:hidden'
          : 'sticky top-[calc(var(--reader-bar-h)+1.5rem)] hidden max-h-[calc(100svh-var(--reader-bar-h)-3rem)] self-start overflow-y-auto min-[1000px]:block'
      }
    >
      <ul
        className={
          chips
            ? 'no-scrollbar flex gap-1.5 overflow-x-auto'
            : 'flex flex-col gap-0.5'
        }
      >
        {items.map((item) => (
          <li key={item.id}>
            <a
              aria-current={active === item.id ? 'true' : undefined}
              className={cn(
                'flex items-center text-sm hover:text-foreground',
                chips
                  ? 'min-h-10 gap-1.5 rounded-xl border border-border bg-surface px-3 whitespace-nowrap'
                  : 'min-h-9 gap-2 rounded-lg px-2.5 text-muted',
                active === item.id &&
                  (chips
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-primary-soft font-semibold text-primary'),
              )}
              href={`#${item.id}`}
              onClick={(event) => {
                if (!scrollToId(item.id)) return
                event.preventDefault()
                setActive(item.id)
              }}
            >
              {chips ? null : (
                <span className="w-4 text-right text-xs tabular-nums text-faint">
                  {item.number}
                </span>
              )}
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
