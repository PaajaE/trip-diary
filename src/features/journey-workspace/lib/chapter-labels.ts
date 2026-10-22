import { formatCompactRange } from '@/features/journey-workspace/lib/format-range'
import type { OverviewChapter } from '@/features/journey-workspace/model/workspace-overview'

/** "28. 5. – 2. 6. 2026" of a chapter, empty when it has no range. */
export function chapterRange(
  chapter: {
    endsAt: string | null
    startsAt: string | null
    tz: string | null
  },
  locale: string,
): string {
  if (chapter.startsAt === null || chapter.endsAt === null) return ''
  return formatCompactRange(
    chapter.startsAt,
    chapter.endsAt,
    chapter.tz,
    locale,
    { withTime: false, withYear: true },
  )
}

/** Display title of a chapter (loose runs have no segment). */
export function chapterTitle(
  chapter: OverviewChapter,
  looseTitle: string,
): string {
  return chapter.segment?.title ?? looseTitle
}
