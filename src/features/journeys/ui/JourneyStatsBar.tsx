import type { LucideIcon } from 'lucide-react'
import { BookOpen, CalendarDays, Camera, MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

interface JourneyStatsBarProps {
  className?: string
  dayCount?: number | null
  mapPointCount: number
  momentCount: number
  photoCount: number
}

export function JourneyStatsBar({
  className,
  dayCount = null,
  mapPointCount,
  momentCount,
  photoCount,
}: JourneyStatsBarProps) {
  const { t } = useTranslation()
  const items: { icon: LucideIcon; label: string }[] = []

  if (dayCount !== null && dayCount > 0) {
    items.push({
      icon: CalendarDays,
      label: t('reader.statDays', { count: dayCount }),
    })
  }
  if (mapPointCount > 0) {
    items.push({
      icon: MapPin,
      label: t('reader.statPlaces', { count: mapPointCount }),
    })
  }
  items.push({
    icon: BookOpen,
    label: t('reader.statMoments', { count: momentCount }),
  })
  items.push({
    icon: Camera,
    label: t('reader.statPhotos', { count: photoCount }),
  })

  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <li
            className="inline-flex min-h-11 items-center gap-2"
            key={item.label}
          >
            <Icon
              aria-hidden="true"
              className="shrink-0 text-primary"
              size={16}
            />
            <span>{item.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
