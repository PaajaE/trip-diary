/**
 * Evenly spread sample of at most `size` items (keeps the original order), so
 * a small test run still covers the whole time span of the library.
 */
export function sampleEvenly<T>(items: readonly T[], size: number): T[] {
  if (size <= 0) {
    return []
  }
  if (items.length <= size) {
    return [...items]
  }
  return Array.from({ length: size }, (_, index) => {
    const picked = items[Math.floor((index * items.length) / size)]
    return picked as T
  })
}
