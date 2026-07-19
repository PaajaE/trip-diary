import { describe, expect, it } from 'vitest'
import { computePhotoMapCamera } from '@trip-diary/utils'

describe('moment photo map camera presence', () => {
  it('omits the map when there are no valid coordinates', () => {
    expect(
      computePhotoMapCamera([
        { id: 'a', latitude: null, longitude: null },
        { id: 'b', latitude: 0, longitude: 0 },
      ]),
    ).toBeNull()
  })

  it('returns a camera for one or more valid geotagged photos', () => {
    expect(
      computePhotoMapCamera([{ id: 'a', latitude: 50.56, longitude: -115.76 }]),
    ).not.toBeNull()

    expect(
      computePhotoMapCamera([
        { id: 'a', latitude: 50.56, longitude: -115.76 },
        { id: 'b', latitude: 51.18, longitude: -116.58 },
      ]),
    ).not.toBeNull()
  })
})
