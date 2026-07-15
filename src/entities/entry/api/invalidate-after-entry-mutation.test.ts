import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { dashboardQueryKeys } from '@/entities/dashboard/api/dashboard-query-keys'
import {
  invalidateAfterEntryDelete,
  invalidateAfterEntryUpdate,
} from '@/entities/entry/api/invalidate-after-entry-mutation'
import { entryQueryKeys } from '@/entities/entry/api/entry-query-keys'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { natureQueryKeys } from '@/entities/nature/api/nature-query-keys'
import { spaceQueryKeys } from '@/entities/space/api/space-query-keys'
import { translationQueryKeys } from '@/entities/translation/api/translation-query-keys'

async function seedQuery(
  client: QueryClient,
  queryKey: readonly unknown[],
): Promise<void> {
  await client.prefetchQuery({
    queryFn: async () => ({ seeded: true }),
    queryKey,
  })
}

describe('invalidateAfterEntryDelete', () => {
  it('removes deleted entry detail and invalidates only affected aggregates', async () => {
    const queryClient = new QueryClient()
    const entryId = '11111111-1111-4111-8111-111111111111'
    const affectedJourneyId = '22222222-2222-4222-8222-222222222222'
    const otherJourneyId = '33333333-3333-4333-8333-333333333333'
    const userId = '44444444-4444-4444-8444-444444444444'

    await seedQuery(queryClient, entryQueryKeys.detail(entryId))
    await seedQuery(queryClient, entryQueryKeys.public(entryId))
    await seedQuery(queryClient, translationQueryKeys.detail(entryId, 'en'))
    await seedQuery(queryClient, journeyQueryKeys.detail(affectedJourneyId))
    await seedQuery(queryClient, journeyQueryKeys.detail(otherJourneyId))
    await seedQuery(
      queryClient,
      natureQueryKeys.journeyObservations(otherJourneyId),
    )
    await seedQuery(queryClient, spaceQueryKeys.byUser(userId))
    await seedQuery(queryClient, dashboardQueryKeys.byUser(userId))
    await seedQuery(queryClient, dashboardQueryKeys.byUserLocal(userId))

    await invalidateAfterEntryDelete(queryClient, {
      entryId,
      journeyId: affectedJourneyId,
      userId,
    })

    expect(
      queryClient.getQueryData(entryQueryKeys.detail(entryId)),
    ).toBeUndefined()
    expect(
      queryClient.getQueryState(journeyQueryKeys.detail(affectedJourneyId))
        ?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(journeyQueryKeys.detail(otherJourneyId))
        ?.isInvalidated,
    ).not.toBe(true)
    expect(
      queryClient.getQueryState(
        natureQueryKeys.journeyObservations(otherJourneyId),
      )?.isInvalidated,
    ).not.toBe(true)
    expect(
      queryClient.getQueryState(spaceQueryKeys.byUser(userId))?.isInvalidated,
    ).not.toBe(true)
    expect(
      queryClient.getQueryState(dashboardQueryKeys.byUser(userId))
        ?.isInvalidated,
    ).toBe(true)
  })
})

describe('invalidateAfterEntryUpdate', () => {
  it('invalidates entry detail, translations, and related journey aggregate', async () => {
    const queryClient = new QueryClient()
    const entryId = '11111111-1111-4111-8111-111111111111'
    const journeyId = '22222222-2222-4222-8222-222222222222'
    const otherJourneyId = '33333333-3333-4333-8333-333333333333'

    await seedQuery(queryClient, entryQueryKeys.detail(entryId))
    await seedQuery(queryClient, translationQueryKeys.detail(entryId, 'en'))
    await seedQuery(queryClient, journeyQueryKeys.detail(journeyId))
    await seedQuery(queryClient, journeyQueryKeys.detail(otherJourneyId))

    await invalidateAfterEntryUpdate(queryClient, { entryId, journeyId })

    expect(
      queryClient.getQueryState(entryQueryKeys.detail(entryId))?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(translationQueryKeys.detail(entryId, 'en'))
        ?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(journeyQueryKeys.detail(journeyId))
        ?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(journeyQueryKeys.detail(otherJourneyId))
        ?.isInvalidated,
    ).not.toBe(true)
  })
})
