import { describe, expect, it } from 'vitest'

import { cs } from './cs'
import { en } from './en'

type Leaf = readonly [path: string, value: string]

function flatten(node: unknown, prefix = ''): Leaf[] {
  if (typeof node === 'string') return [[prefix, node]]
  if (typeof node !== 'object' || node === null) return []
  return Object.entries(node).flatMap(([key, value]) =>
    flatten(value, prefix === '' ? key : `${prefix}.${key}`),
  )
}

/** Placeholders like {{moments}} are code identifiers, not visible text. */
function visible(value: string): string {
  return value.replace(/\{\{[^}]*\}\}/g, ' ')
}

const csLeaves = flatten(cs)
const enLeaves = flatten(en)

/**
 * Czech paths whose value may contain "moment" (e.g. a real Czech word such as
 * "momentálně"). Empty on purpose: the unit under a day is called "zastávka".
 */
const MOMENT_ALLOWLIST = new Set<string>()

/**
 * Formal (vykání) markers. The UI speaks informal singular (tykání).
 * Whole words, matched case-insensitively.
 */
const FORMAL_MARKERS = [
  'vy',
  'vás',
  'vám',
  'vámi',
  'váš',
  'vaše',
  'vašeho',
  'vašich',
  'vašim',
  'vaši',
  'vaším',
  'vaší',
  'jste',
  'budete',
  'můžete',
  'chcete',
  'máte',
  'smíte',
  'nejste',
  'nemáte',
  'zkuste',
  'zkontrolujte',
  'přihlaste',
  'vyberte',
  'napište',
  'povolte',
  'přidejte',
  'dejte',
  'pozvěte',
  'vraťte',
  'použijte',
  'otevřete',
]

/** Sentence-initial words ending in "te" that are not formal imperatives. */
const TE_ALLOWLIST = new Set<string>(['kde', 'proč'])

const WORD = /[\p{L}]+/gu

function words(text: string): string[] {
  return text.match(WORD) ?? []
}

function sentenceStarts(text: string): string[] {
  const starts: string[] = []
  // Strip interpolation placeholders so they are never read as words.
  const clean = text.replace(/\{\{[^}]*\}\}/g, ' ')
  for (const sentence of clean.split(/(?<=[.!?…:])\s+|^/u)) {
    const first = words(sentence)[0]
    if (first !== undefined) starts.push(first.toLowerCase())
  }
  return starts
}

describe('i18n vocabulary', () => {
  it('has the same key set in Czech and English', () => {
    const csKeys = csLeaves.map(([path]) => path).sort()
    const enKeys = enLeaves.map(([path]) => path).sort()
    expect(csKeys).toEqual(enKeys)
  })

  it('never uses "moment" in user-visible Czech text', () => {
    const offenders = csLeaves.filter(
      ([path, value]) =>
        /moment/i.test(visible(value)) && !MOMENT_ALLOWLIST.has(path),
    )
    expect(offenders).toEqual([])
  })

  it('never uses "moment" in user-visible English text', () => {
    const offenders = enLeaves.filter(([, value]) =>
      /moment/i.test(visible(value)),
    )
    expect(offenders).toEqual([])
  })

  it('uses informal singular in Czech (no formal markers)', () => {
    const markers = new Set(FORMAL_MARKERS)
    const offenders = csLeaves.filter(([, value]) =>
      words(value).some((word) => markers.has(word.toLowerCase())),
    )
    expect(offenders).toEqual([])
  })

  it('has no formal imperative ("...te") at the start of a Czech sentence', () => {
    const offenders = csLeaves.filter(([, value]) =>
      sentenceStarts(value).some(
        (word) =>
          word.length > 3 && word.endsWith('te') && !TE_ALLOWLIST.has(word),
      ),
    )
    expect(offenders).toEqual([])
  })

  it('has no arrow glyphs in the day navigation labels', () => {
    const arrows = /[←→]/
    for (const bundle of [cs, en]) {
      for (const key of ['back', 'prevDay', 'nextDay'] as const) {
        expect(bundle.dayDetail[key]).not.toMatch(arrows)
      }
    }
  })
})
