import { z } from 'zod'
import {
  spaceSummarySchema,
  type SpaceSummary,
} from '@/entities/space/model/space'
import { localDb } from '@/shared/lib/local-db'

const cachedUserSpacesSchema = z.object({
  cachedAt: z.iso.datetime({ offset: true }),
  spaces: z.array(spaceSummarySchema),
  userId: z.uuid(),
})

export type CachedUserSpacesRecord = z.infer<typeof cachedUserSpacesSchema>

export async function saveCachedUserSpaces(
  userId: string,
  spaces: SpaceSummary[],
): Promise<void> {
  await localDb.cachedUserSpaces.put(
    cachedUserSpacesSchema.parse({
      cachedAt: new Date().toISOString(),
      spaces,
      userId,
    }),
  )
}

export async function getCachedUserSpaces(
  userId: string,
): Promise<SpaceSummary[] | null> {
  const record = await localDb.cachedUserSpaces.get(userId)
  if (record === undefined) {
    return null
  }
  return cachedUserSpacesSchema.parse(record).spaces
}
