import type { QueryClient } from '@tanstack/react-query'
import type { Entry } from '@/entities/entry/model/entry'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { patchJourneyEntryText } from '@/entities/journey/api/journey-local-merge'
import { getCachedCanContributeToJourney } from '@/entities/journey/api/journey.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { saveJourneySnapshot } from '@/entities/journey/api/local-journey-cache.repository'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { invalidateEntryTranslations } from '@/entities/translation/api/invalidate-entry-translations'

export async function commitJourneyEntryTextUpdate(
  queryClient: QueryClient,
  input: { journeyId: string; updated: Entry },
): Promise<void> {
  const patch = {
    body: input.updated.body,
    entryId: input.updated.id,
    slug: input.updated.slug,
    syncStatus: input.updated.syncStatus,
    title: input.updated.title,
  }

  await Promise.all([
    queryClient.cancelQueries({
      queryKey: journeyQueryKeys.detail(input.journeyId),
    }),
    queryClient.cancelQueries({
      queryKey: journeyQueryKeys.detailLocal(input.journeyId),
    }),
    queryClient.cancelQueries({
      queryKey: journeyQueryKeys.publicDetail(input.journeyId),
    }),
    queryClient.cancelQueries({
      queryKey: entryQueryKeys.detail(input.updated.id),
    }),
  ])

  const apply = (current: JourneyDetail | undefined) =>
    current === undefined ? current : patchJourneyEntryText(current, patch)

  queryClient.setQueryData(journeyQueryKeys.detail(input.journeyId), apply)
  queryClient.setQueryData(journeyQueryKeys.detailLocal(input.journeyId), apply)
  queryClient.setQueryData(
    journeyQueryKeys.publicDetail(input.journeyId),
    apply,
  )
  queryClient.setQueryData(
    entryQueryKeys.detail(input.updated.id),
    input.updated,
  )

  const next =
    queryClient.getQueryData<JourneyDetail>(
      journeyQueryKeys.detailLocal(input.journeyId),
    ) ??
    queryClient.getQueryData<JourneyDetail>(
      journeyQueryKeys.detail(input.journeyId),
    )

  if (next !== undefined) {
    const canContribute =
      (await getCachedCanContributeToJourney(input.journeyId)) ?? true
    await saveJourneySnapshot(next, canContribute)
  }

  void invalidateEntryTranslations(queryClient, input.updated.id)
}
