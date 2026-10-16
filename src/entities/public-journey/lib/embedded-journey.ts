import {
  parsePublicJourney,
  type PublicJourney,
} from '@trip-diary/core/public-journey'
import { z } from 'zod'

/** Must match EMBED_SCRIPT_ID in scripts/lib/prerender.mjs. */
export const EMBEDDED_JOURNEY_ELEMENT_ID = '__PUBLIC_JOURNEY__'

const envelopeSchema = z.object({
  journey: z.unknown(),
  journeySlug: z.string().min(1),
  spaceHandle: z.string().min(1),
})

/**
 * Reads the journey tree embedded by the build-time prerender. Returns
 * `undefined` when absent, invalid, or for a different handle/slug, so the
 * caller falls back to a normal fetch.
 */
export function readEmbeddedJourney(
  spaceHandle: string,
  journeySlug: string,
  doc: Pick<Document, 'getElementById'> = document,
): PublicJourney | undefined {
  const element = doc.getElementById(EMBEDDED_JOURNEY_ELEMENT_ID)
  const text = element?.textContent
  if (text === undefined || text === '') return undefined
  try {
    const envelope = envelopeSchema.parse(JSON.parse(text))
    if (
      envelope.spaceHandle !== spaceHandle ||
      envelope.journeySlug !== journeySlug
    ) {
      return undefined
    }
    return parsePublicJourney(envelope.journey) ?? undefined
  } catch {
    return undefined
  }
}

const heroMirrorSchema = z.object({
  heroMirror: z
    .object({ from: z.url(), to: z.string().regex(/^\/(?!\/)/) })
    .optional(),
})

/**
 * The prerender copies one hero variant next to the page and the static shell
 * shows that copy. Reading the mapping lets the React hero request the very
 * same URL, so the image is downloaded once. `undefined` when absent/invalid.
 */
export function readHeroMirror(
  doc: Pick<Document, 'getElementById'> = document,
): { from: string; to: string } | undefined {
  const text = doc.getElementById(EMBEDDED_JOURNEY_ELEMENT_ID)?.textContent
  if (text === undefined || text === '') return undefined
  try {
    return heroMirrorSchema.parse(JSON.parse(text)).heroMirror
  } catch {
    return undefined
  }
}
