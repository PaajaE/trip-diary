import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '../..')
const srcRoot = join(repoRoot, 'src')

const guardedRoots = [
  "'entries'",
  "'journeys'",
  "'journey-checklist'",
  "'journey-observations'",
  "'journey-photo-tags'",
  "'journey-gallery'",
  "'dashboard'",
  "'spaces'",
  "'engagement'",
  "'entry-translations'",
] as const

const allowedSuffixes = ['query-keys.ts', 'query-keys.test.ts']

function walkSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return walkSourceFiles(absolutePath)
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return []
    }
    return [absolutePath]
  })
}

describe('query key convention guard', () => {
  it('does not define guarded domain roots outside factory files', () => {
    const violations: string[] = []

    for (const filePath of walkSourceFiles(srcRoot)) {
      const relativePath = relative(repoRoot, filePath)
      if (allowedSuffixes.some((suffix) => relativePath.endsWith(suffix))) {
        continue
      }

      const contents = readFileSync(filePath, 'utf8')
      for (const root of guardedRoots) {
        if (contents.includes(`queryKey: [${root}`)) {
          violations.push(`${relativePath} uses inline queryKey: [${root.slice(1, -1)}, ...]`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
