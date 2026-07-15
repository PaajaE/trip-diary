import { useQuery } from '@tanstack/react-query'
import {
  getCachedDashboardData,
  getDashboardData,
} from '@/entities/dashboard/api/dashboard.repository'
import { dashboardQueryKeys } from '@/entities/dashboard/api/dashboard-query-keys'

export function useDashboardQuery(userId: string | undefined) {
  const cacheQuery = useQuery({
    enabled: userId !== undefined && userId !== '',
    queryFn: () => getCachedDashboardData({ userId: userId ?? '' }),
    queryKey: dashboardQueryKeys.byUserLocal(userId),
  })

  const dashboardQuery = useQuery({
    enabled: userId !== undefined && userId !== '' && cacheQuery.isFetched,
    placeholderData: () => cacheQuery.data ?? undefined,
    queryFn: () => getDashboardData({ userId: userId ?? '' }),
    queryKey: dashboardQueryKeys.byUser(userId),
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
