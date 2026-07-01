/**
 * Placeholder for future authenticated iNaturalist API calls (e.g. creating
 * observations on behalf of a logged-in user). MVP uses public GET endpoints
 * in the sibling modules only.
 */

export interface InaturalistAuthenticatedConfig {
  accessToken: string
}

export function isInaturalistAuthenticatedConfigured(
  config: Partial<InaturalistAuthenticatedConfig>,
): config is InaturalistAuthenticatedConfig {
  return (
    config.accessToken !== undefined && config.accessToken.trim().length > 0
  )
}
