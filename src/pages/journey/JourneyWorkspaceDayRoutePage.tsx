import { useParams, useSearch } from '@tanstack/react-router'
import { z } from 'zod'
import { JourneyWorkspaceDay } from '@/features/journey-workspace/ui/JourneyWorkspaceDay'
import { UNKNOWN_DAY } from '@/features/journey-workspace/model/workspace-days'
import { useTranslation } from 'react-i18next'

/** A local calendar day ("2026-06-03") or the bucket of undated moments. */
const dayParamSchema = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.literal(UNKNOWN_DAY),
])

export function JourneyWorkspaceDayRoutePage() {
  const { t } = useTranslation()
  const { date, journeyId } = useParams({
    from: '/j/$journeyId/workspace/day/$date',
  })
  const { cull } = useSearch({ from: '/j/$journeyId/workspace/day/$date' })
  const parsed = dayParamSchema.safeParse(date)
  if (!parsed.success)
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p role="status">{t('workspace.dayNotFound')}</p>
      </main>
    )
  return (
    <JourneyWorkspaceDay
      cull={cull === true}
      date={parsed.data}
      journeyId={journeyId}
    />
  )
}
