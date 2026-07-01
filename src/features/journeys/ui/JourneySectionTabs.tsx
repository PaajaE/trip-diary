import { Images, LayoutGrid, MapPin, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { JOURNEY_SECTION_NAV_ID } from '@/features/journeys/lib/scroll-to-journey-section-nav'

export type JourneySection = 'overview' | 'map' | 'gallery' | 'more'

interface JourneySectionTabsProps {
  activeSection: JourneySection
  moreOpen?: boolean
  onSelect: (section: JourneySection) => void
}

const tabs: {
  icon: typeof LayoutGrid
  labelKey: string
  section: JourneySection
}[] = [
  { icon: LayoutGrid, labelKey: 'journey.overview', section: 'overview' },
  { icon: MapPin, labelKey: 'journey.map', section: 'map' },
  { icon: Images, labelKey: 'journey.gallery', section: 'gallery' },
  { icon: MoreHorizontal, labelKey: 'journey.more', section: 'more' },
]

export function JourneySectionTabs({
  activeSection,
  moreOpen = false,
  onSelect,
}: JourneySectionTabsProps) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('journey.explore')}
      className="sticky top-[calc(4rem-0.25rem)] z-10 mt-5 flex gap-0.5 overflow-x-auto border-b border-border/80 bg-background/90 backdrop-blur snap-x snap-mandatory sm:top-3 sm:snap-none"
      id={JOURNEY_SECTION_NAV_ID}
    >
      {tabs.map(({ icon: Icon, labelKey, section }) => {
        const active = section === 'more' ? moreOpen : activeSection === section
        return (
          <button
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 shrink-0 snap-center items-center justify-center gap-1.5 border-b-2 px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:gap-2',
              active
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-muted hover:text-foreground',
            )}
            key={section}
            onClick={() => {
              onSelect(section)
            }}
            type="button"
          >
            <Icon aria-hidden="true" size={15} />
            <span className="truncate">{t(labelKey)}</span>
          </button>
        )
      })}
    </nav>
  )
}
