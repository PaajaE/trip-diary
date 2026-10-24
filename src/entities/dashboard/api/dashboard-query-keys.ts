export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  byUser: (userId: string | undefined) => ['dashboard', userId] as const,
  covers: (userId: string | undefined, mediaIds: string[]) =>
    ['dashboard', userId, 'covers', mediaIds] as const,
  progress: (userId: string | undefined, journeyIds: string[]) =>
    ['dashboard', userId, 'progress', journeyIds] as const,
  byUserLocal: (userId: string | undefined) =>
    ['dashboard', userId, 'local'] as const,
} as const
