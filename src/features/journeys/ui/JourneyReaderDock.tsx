import { BookOpen, FolderOpen, Images, Lightbulb, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  JOURNEY_READER_SECTION_IDS,
  scrollToReaderSection,
  type JourneyReaderSection,
} from '@/features/journeys/lib/journey-reader-section'
import { cn } from '@/shared/lib/cn'

interface JourneyReaderDockProps {
  showCollections: boolean
  showGuides: boolean
}

const dockSections: {
  icon: typeof BookOpen
  labelKey: string
  section: JourneyReaderSection
}[] = [
  { icon: BookOpen, labelKey: 'reader.dockStory', section: 'story' },
  { icon: MapPin, labelKey: 'journey.map', section: 'map' },
  { icon: Images, labelKey: 'journey.gallery', section: 'gallery' },
  {
    icon: FolderOpen,
    labelKey: 'reader.collections',
    section: 'collections',
  },
  { icon: Lightbulb, labelKey: 'journey.guides', section: 'guides' },
]

export function JourneyReaderDock({
  showCollections,
  showGuides,
}: JourneyReaderDockProps) {
  const { t } = useTranslation()
  const [activeSection, setActiveSection] =
    useState<JourneyReaderSection>('story')

  const visibleSections = dockSections.filter(({ section }) => {
    if (section === 'collections') {
      return showCollections
    }
    if (section === 'guides') {
      return showGuides
    }
    return true
  })

  useEffect(() => {
    const sectionIds = Object.values(JOURNEY_READER_SECTION_IDS)
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)

    if (elements.length === 0) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (window.scrollY < 96) {
          setActiveSection('story')
          return
        }

        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio,
          )

        const top = visible[0]?.target.id
        if (top === undefined) {
          return
        }

        const matched = (
          Object.entries(JOURNEY_READER_SECTION_IDS) as [
            JourneyReaderSection,
            string,
          ][]
        ).find(([, id]) => id === top)

        if (matched !== undefined) {
          setActiveSection(matched[0])
        }
      },
      {
        rootMargin: '-28% 0px -52% 0px',
        threshold: [0.15, 0.4],
      },
    )

    for (const element of elements) {
      observer.observe(element)
    }

    return () => {
      observer.disconnect()
    }
  }, [showCollections, showGuides])

  return (
    <nav
      aria-label={t('journey.explore')}
      className="reader-dock pointer-events-none fixed inset-x-0 bottom-4 z-30 px-4 sm:bottom-6"
    >
      <div className="pointer-events-auto mx-auto flex max-w-md items-center justify-center gap-1 rounded-full border border-border/70 bg-surface/95 p-1.5 shadow-soft backdrop-blur-md">
        {visibleSections.map(({ icon: Icon, labelKey, section }) => {
          const active = activeSection === section
          return (
            <button
              aria-current={active ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-10 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 text-[0.68rem] font-semibold transition sm:min-h-11 sm:flex-row sm:gap-1.5 sm:px-3 sm:text-xs',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted hover:bg-background hover:text-foreground',
              )}
              key={section}
              onClick={() => {
                scrollToReaderSection(section)
              }}
              type="button"
            >
              <Icon aria-hidden="true" size={15} />
              <span className="truncate">{t(labelKey)}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
