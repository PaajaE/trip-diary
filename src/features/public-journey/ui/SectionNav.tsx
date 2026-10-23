import { useTranslation } from 'react-i18next'
import {
  scrollToId,
  useScrollSpy,
} from '@/features/public-journey/lib/use-scroll-spy'
import { cn } from '@/shared/lib/cn'

export interface SectionNavItem {
  id: string
  label: string
}

/** Sticky in-page navigation; highlights the section being read. */
export function SectionNav({ items }: { items: readonly SectionNavItem[] }) {
  const { t } = useTranslation()
  const [active, setActive] = useScrollSpy(items.map((item) => item.id))
  if (items.length < 2) return null
  return (
    <nav
      aria-label={t('publicJourney.sectionNav')}
      className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur"
    >
      <ul className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 py-2">
        {items.map((item) => (
          <li key={item.id}>
            <a
              aria-current={active === item.id ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-full px-3.5 text-sm font-semibold text-muted hover:text-foreground',
                active === item.id && 'bg-primary-soft text-primary',
              )}
              href={`#${item.id}`}
              onClick={(event) => {
                if (!scrollToId(item.id)) return
                event.preventDefault()
                setActive(item.id)
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
