// Minimal search-param validation for the router. It replaces zod here so the
// landing page does not ship the whole validation library in its entry chunk.

type Parser<T> = (value: unknown, key: string) => T | undefined

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function invalid(key: string): never {
  throw new Error(`Invalid search parameter: ${key}`)
}

export function optionalString(): Parser<string> {
  return (value, key) => {
    if (value === undefined) return undefined
    return typeof value === 'string' ? value : invalid(key)
  }
}

export function optionalUuid(): Parser<string> {
  return (value, key) => {
    if (value === undefined) return undefined
    return typeof value === 'string' && UUID_PATTERN.test(value)
      ? value
      : invalid(key)
  }
}

export function optionalEnum<const T extends string>(
  options: readonly T[],
): Parser<T> {
  return (value, key) => {
    if (value === undefined) return undefined
    return options.find((option) => option === value) ?? invalid(key)
  }
}

type ParsedSearch<S extends Record<string, Parser<unknown>>> = {
  [K in keyof S]?: ReturnType<S[K]> | undefined
}

/** Keeps only the declared keys and throws on a malformed value, like `z.object().parse`. */
export function searchSchema<S extends Record<string, Parser<unknown>>>(
  shape: S,
) {
  return (search: Record<string, unknown>): ParsedSearch<S> => {
    const result: Record<string, unknown> = {}
    for (const [key, parser] of Object.entries(shape)) {
      const parsed = parser(search[key], key)
      if (parsed !== undefined) result[key] = parsed
    }
    return result as ParsedSearch<S>
  }
}
