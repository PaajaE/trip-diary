import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface Crumb {
  label: string
  to?: 'journey' | 'segment'
  segmentId?: string
}

interface CrumbsProps {
  crumbs: Crumb[]
  journeySlug: string
  spaceHandle: string
}

export function Crumbs({ crumbs, journeySlug, spaceHandle }: CrumbsProps) {
  const { t } = useTranslation()
  return (
    <nav
      aria-label={t('publicJourney.breadcrumb')}
      className="text-[13px] text-muted"
    >
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((crumb, index) => (
          <li
            className="flex items-center gap-1"
            key={`${crumb.label}-${String(index)}`}
          >
            {index > 0 ? (
              <ChevronRight aria-hidden="true" className="size-3" />
            ) : null}
            {crumb.to === 'journey' ? (
              <Link
                className="underline decoration-border underline-offset-2 hover:text-foreground"
                params={{ journeySlug, spaceHandle }}
                to="/$spaceHandle/$journeySlug"
              >
                {crumb.label}
              </Link>
            ) : crumb.to === 'segment' && crumb.segmentId !== undefined ? (
              <Link
                className="underline decoration-border underline-offset-2 hover:text-foreground"
                params={{
                  journeySlug,
                  segmentId: crumb.segmentId,
                  spaceHandle,
                }}
                to="/$spaceHandle/$journeySlug/e/$segmentId"
              >
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page">{crumb.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
