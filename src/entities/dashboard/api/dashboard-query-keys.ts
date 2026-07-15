export const dashboardQueryKeys = {
  all: ['dashboard'] as const,
  byUser: (userId: string | undefined) => ['dashboard', userId] as const,
  byUserLocal: (userId: string | undefined) =>
    ['dashboard', userId, 'local'] as const,
} as const
