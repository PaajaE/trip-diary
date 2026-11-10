import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The global checkbox/radio look lives in src/index.css. A control that sets
// its own size or appearance would silently fight it, so keep them out.
const root = resolve(process.cwd(), 'src')
const files = (readdirSync(root, { recursive: true }) as string[])
  .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
  .map((f) => join(root, f))

describe('global checkbox and radio style', () => {
  it('is not overridden by per-control size or appearance classes', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const tag of source.match(/<input\b[^>]*>/gs) ?? []) {
        if (!/type=["']?(checkbox|radio)/.test(tag)) continue
        if (/\b(size-\d|w-\d|h-\d|accent-\w|appearance-)/.test(tag))
          offenders.push(file.slice(root.length + 1))
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps a forced-colors fallback', () => {
    const css = readFileSync(join(root, 'index.css'), 'utf8')
    expect(css).toContain('forced-colors: active')
  })
})
