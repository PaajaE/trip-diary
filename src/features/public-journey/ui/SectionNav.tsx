import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

export interface SectionNavItem {
  id: string
  label: string
}

/** Sticky in-page navigation; highlights the section being read. */
export function SectionNav({ items }: { items: readonly SectionNavItem[] }) {
  const { t } = useTranslation()
  const [active, setActive] = useState(items[0]?.id ?? '')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = items.find((item) => visible.has(item.id))
        if (first !== undefined) setActive(first.id)
      },
      { rootMargin: '-20% 0px -60% 0px' },
    )
    for (const item of items) {
      const element = document.getElementById(item.id)
      if (element !== null) observer.observe(element)
    }
    return () => {
      observer.disconnect()
    }
  }, [items])
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
                const target = document.getElementById(item.id)
                if (target === null) return
                event.preventDefault()
                const reduce = window.matchMedia(
                  '(prefers-reduced-motion: reduce)',
                ).matches
                target.scrollIntoView({
                  behavior: reduce ? 'auto' : 'smooth',
                  block: 'start',
                })
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
