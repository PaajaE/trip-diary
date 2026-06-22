import {
  dashboardDataSchema,
  type DashboardData,
} from '@/entities/dashboard/model/dashboard'
import { localDb } from '@/shared/lib/local-db'

export async function saveDashboardCache(
  userId: string,
  data: DashboardData,
): Promise<void> {
  await localDb.dashboardSnapshots.put({
    cachedAt: new Date().toISOString(),
    data: dashboardDataSchema.parse(data),
    userId,
  })
}

export async function getDashboardCache(
  userId: string,
): Promise<DashboardData | null> {
  const snapshot = await localDb.dashboardSnapshots.get(userId)
  if (snapshot === undefined) {
    return null
  }

  return dashboardDataSchema.parse(snapshot.data)
}
