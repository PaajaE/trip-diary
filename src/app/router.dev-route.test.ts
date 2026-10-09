import { describe, expect, it } from 'vitest'
import { router } from '@/app/router'

describe('developer routes', () => {
  it('does not route media library diagnostics on the web', () => {
    const paths = Object.keys(router.routesByPath)

    expect(paths).not.toContain('/dev/media-library')
    expect(paths).toContain('/$spaceHandle/$journeySlug')
  })
})
