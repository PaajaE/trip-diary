import { describe, expect, it } from 'vitest'
import { resolveDeepLinkPath } from './deep-link'

describe('resolveDeepLinkPath', () => {
  it.each([
    ['tripdiary://app/dev/media-library', '/dev/media-library'],
    ['tripdiary://app/j/abc?section=map', '/j/abc?section=map'],
    ['tripdiary://app', '/'],
    ['tripdiary://app/', '/'],
  ])('maps %s', (url, expected) => {
    expect(resolveDeepLinkPath(url)).toBe(expected)
  })

  it.each([
    'https://cestovni-denik.cz/dev/media-library',
    'tripdiary://evil/dev',
    'otherapp://app/dev',
    'not a url',
    'tripdiary://app//evil.example.com',
  ])('ignores %s', (url) => {
    expect(resolveDeepLinkPath(url)).toBeNull()
  })
})
