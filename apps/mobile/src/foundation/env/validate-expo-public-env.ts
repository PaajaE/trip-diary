import {
  expoPublicEnvFromProcess,
  readExpoPublicEnv,
  type MobilePublicEnv,
} from '@/platform/env'

const REQUIRED_EXPO_PUBLIC_VARS = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
] as const

export class ConfigurationError extends Error {
  readonly missingVars: readonly string[]

  constructor(missingVars: readonly string[]) {
    const listed = missingVars.map((name) => `- ${name}`).join('\n')
    const devHint =
      typeof __DEV__ !== 'undefined' && __DEV__
        ? '\n\nCopy apps/mobile/.env.example to apps/mobile/.env and fill in the required values.'
        : ''

    super(`Missing required environment variables:\n${listed}${devHint}`)
    this.name = 'ConfigurationError'
    this.missingVars = missingVars
  }
}

function collectMissingVars(raw: Record<string, unknown>): readonly string[] {
  return REQUIRED_EXPO_PUBLIC_VARS.filter((name) => {
    const value = raw[name]
    return typeof value !== 'string' || value.trim().length === 0
  })
}

export function validateExpoPublicEnv(
  raw: Record<string, unknown> = expoPublicEnvFromProcess(),
): MobilePublicEnv {
  const missingVars = collectMissingVars(raw)
  if (missingVars.length > 0) {
    throw new ConfigurationError(missingVars)
  }

  return readExpoPublicEnv(raw)
}
