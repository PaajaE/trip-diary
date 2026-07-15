import { describe, expect, it } from 'vitest'
import { shouldRequestDeviceLocation } from '@/platform/maps/map-view-screen.logic'

describe('MapViewScreen location policy', () => {
  it('does not request device location when journey stops drive the map', () => {
    expect(
      shouldRequestDeviceLocation({
        journeyMode: true,
        propCenterAvailable: false,
        useDeviceLocationFallback: true,
      }),
    ).toBe(false)
  })

  it('requests device location only for explicit fallback flows', () => {
    expect(
      shouldRequestDeviceLocation({
        journeyMode: false,
        propCenterAvailable: false,
        useDeviceLocationFallback: true,
      }),
    ).toBe(true)
  })
})
