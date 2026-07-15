export const journeyQueryKeys = {
  all: ['journeys'] as const,
  detail: (journeyId: string) => [...journeyQueryKeys.all, journeyId] as const,
  detailLocal: (journeyId: string) =>
    [...journeyQueryKeys.all, journeyId, 'local'] as const,
  list: (userId: string) => [...journeyQueryKeys.all, 'list', userId] as const,
  stops: (userId: string, journeyId: string) =>
    [...journeyQueryKeys.all, 'stops', userId, journeyId] as const,
}
