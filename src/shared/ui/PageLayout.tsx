import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

type PageWidth = 'form' | 'narrow' | 'wide'

const WIDTHS: Record<PageWidth, string> = {
  form: 'max-w-3xl',
  narrow: 'max-w-5xl',
  wide: 'max-w-[96rem]',
}

/** Shared frame of every owner page: one width scale, one padding rhythm. */
export function PageContainer({
  children,
  className,
  width = 'narrow',
}: {
  children: ReactNode
  className?: string
  width?: PageWidth
}) {
  return (
    <main
      className={cn(
        'mx-auto min-h-[calc(100svh-4rem)] w-full px-5 py-6 sm:px-8 sm:py-10',
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </main>
  )
}

/**
 * Breadcrumb, serif page title, optional description and right-aligned
 * actions. `crumbs` are ready-made nodes (typically router links); the last
 * one is the current page.
 */
export function PageHeader({
  actions,
  crumbs,
  description,
  descriptionClassName,
  title,
}: {
  actions?: ReactNode
  crumbs?: ReactNode[]
  description?: ReactNode
  descriptionClassName?: string
  title: string
}) {
  const { t } = useTranslation()
  return (
    <header className="mb-4 sm:mb-6">
      {crumbs === undefined || crumbs.length === 0 ? null : (
        <nav aria-label={t('owner.breadcrumb')}>
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
            {crumbs.map((crumb, index) => (
              <li
                aria-current={index === crumbs.length - 1 ? 'page' : undefined}
                className="flex min-w-0 items-center gap-1.5"
                key={index}
              >
                {index > 0 ? (
                  <ChevronRight
                    aria-hidden="true"
                    className="shrink-0"
                    size={14}
                  />
                ) : null}
                {crumb}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="reader-display break-words text-2xl tracking-[-0.03em] sm:text-4xl">
            {title}
          </h1>
          {description === undefined ? null : (
            <p
              className={cn(
                'mt-2 max-w-2xl text-base leading-7 text-muted',
                descriptionClassName,
              )}
            >
              {description}
            </p>
          )}
        </div>
        {actions === undefined ? null : (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  )
}

/** Section title used inside owner pages, optionally with a side action. */
export function SectionHeading({
  action,
  children,
  description,
}: {
  action?: ReactNode
  children: ReactNode
  description?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
          {children}
        </h2>
        {description === undefined ? null : (
          <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
        )}
      </div>
      {action === undefined ? null : <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** Surface for forms and grouped content (single radius, no nesting). */
export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border/70 bg-surface p-5 shadow-soft sm:p-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
