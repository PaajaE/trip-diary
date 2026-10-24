import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read the source file directly: the Vite CSS pipeline would expand @theme.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

type Tokens = Record<string, string>

function readTokens(block: string): Tokens {
  const tokens: Tokens = {}
  for (const match of block.matchAll(
    /--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g,
  )) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) tokens[name] = value
  }
  return tokens
}

function blockAfter(marker: string): string {
  const start = css.indexOf(marker)
  if (start < 0) throw new Error(`missing ${marker} in index.css`)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`unbalanced block after ${marker}`)
}

function channel(hex: string, offset: number): number {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  )
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

const light = readTokens(blockAfter('@theme'))
const dark = readTokens(blockAfter(":root[data-theme='dark']"))
const darkAuto = readTokens(blockAfter('@media (prefers-color-scheme: dark)'))

const TEXT_PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'surface'],
  ['muted', 'background'],
  ['muted', 'surface'],
  ['primary', 'background'],
  ['primary', 'surface'],
  ['primary-foreground', 'primary'],
  ['accent-strong', 'accent-soft'],
  ['accent-strong', 'background'],
  ['destructive', 'background'],
  ['destructive', 'surface'],
  ['warn', 'warn-soft'],
  ['primary', 'primary-soft'],
]
// Non-text pairs. `border` is a deliberately soft decorative hairline and the
// light `faint` is a placeholder tint, so both are known gaps in the original
// light palette: they get a regression floor instead of the 3:1 target.
// `faint` is dark-only compliant; raise these floors, never lower them.
const NON_TEXT_PAIRS: [string, string, number, number][] = [
  // [fg, bg, light floor, dark floor]
  ['border', 'background', 1.2, 1.4],
  ['faint', 'background', 2.9, 3],
]

describe('theme tokens', () => {
  it('defines every colour token in both themes', () => {
    expect(Object.keys(light).length).toBeGreaterThanOrEqual(16)
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort())
    expect(darkAuto).toEqual(dark)
  })

  describe.each([
    ['light', light],
    ['dark', dark],
  ])('%s contrast', (themeName, tokens) => {
    it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
      const a = tokens[fg]
      const b = tokens[bg]
      expect(a).toBeDefined()
      expect(b).toBeDefined()
      expect(ratio(a ?? '', b ?? '')).toBeGreaterThanOrEqual(4.5)
    })

    it.each(NON_TEXT_PAIRS)('%s on %s keeps its floor', (fg, bg, l, d) => {
      const floor = themeName === 'light' ? l : d
      expect(ratio(tokens[fg] ?? '', tokens[bg] ?? '')).toBeGreaterThanOrEqual(
        floor,
      )
    })
  })
})
