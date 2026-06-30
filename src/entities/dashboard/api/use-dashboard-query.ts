import { useQuery } from '@tanstack/react-query'
import {
  getCachedDashboardData,
  getDashboardData,
} from '@/entities/dashboard/api/dashboard.repository'

export function useDashboardQuery(userId: string | undefined) {
  const cacheQuery = useQuery({
    enabled: userId !== undefined && userId !== '',
    queryFn: () => getCachedDashboardData({ userId: userId ?? '' }),
    queryKey: ['dashboard', userId, 'local'],
  })

  const dashboardQuery = useQuery({
    enabled: userId !== undefined && userId !== '' && cacheQuery.isFetched,
    placeholderData: () => cacheQuery.data ?? undefined,
    queryFn: () => getDashboardData({ userId: userId ?? '' }),
    queryKey: ['dashboard', userId],
  })

  return {
    ...dashboardQuery,
    data: dashboardQuery.data ?? cacheQuery.data,
    isLoading: dashboardQuery.isLoading && cacheQuery.data === undefined,
    isRevalidating:
      dashboardQuery.isFetching &&
      cacheQuery.data !== undefined &&
      !dashboardQuery.isLoading,
  }
}
