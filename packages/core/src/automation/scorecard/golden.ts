import { z } from 'zod'
import { mediaQualitySchema } from '../quality.ts'

/**
 * A hand-labelled set: media plus what the author decided. Only the parts
 * that are present are scored. Real sets live outside the repository (it is
 * public); `scripts/algo-score.mjs` reads them from `GOLDEN_DIR`.
 */
export const goldenSetSchema = z.object({
  homeTimeZone: z.string().min(1),
  media: z.array(
    z.object({
      capturedAt: z.string().nullable(),
      /** Optional analysis fields; only the junk metric reads them. */
      height: z.number().int().positive().nullable().optional(),
      id: z.string().min(1),
      kind: z.enum(['photo', 'video']).optional(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      quality: mediaQualitySchema.nullable().optional(),
      screenshot: z.boolean().optional(),
      starred: z.boolean().optional(),
      width: z.number().int().positive().nullable().optional(),
    }),
  ),
  name: z.string().min(1),
  truth: z.object({
    /** media id -> local date (YYYY-MM-DD) the author considers it to be. */
    dayByMediaId: z.record(z.string(), z.string()).optional(),
    duplicateGroups: z.array(z.array(z.string())).optional(),
    /** Photos the author would throw away without a second look. */
    junkIds: z.array(z.string()).optional(),
    /** First local date of every stage after the first. */
    stageStarts: z.array(z.string()).optional(),
  }),
})

export type GoldenSet = z.infer<typeof goldenSetSchema>
