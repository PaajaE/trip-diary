export const journeyQueryKeys = {
  all: ['journeys'] as const,
  content: (journeyId: string) =>
    [...journeyQueryKeys.all, journeyId, 'content'] as const,
  detail: (journeyId: string) => [...journeyQueryKeys.all, journeyId] as const,
  detailLocal: (journeyId: string) =>
    [...journeyQueryKeys.all, journeyId, 'local'] as const,
  entry: (entryId: string) => ['entries', entryId] as const,
  list: (userId: string, spaceId: string) =>
    [...journeyQueryKeys.all, 'list', userId, spaceId] as const,
  stops: (userId: string, journeyId: string) =>
    [...journeyQueryKeys.all, 'stops', userId, journeyId] as const,
}
