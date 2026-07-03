import { describe, expect, it } from 'vitest'
import type { JourneyMapPoint } from '@/features/journeys/ui/journey-map-points'
import {
  createJourneyMapPinElement,
  refreshJourneyMapPinElement,
} from '@/features/journeys/ui/journey-map-photo-marker'

describe('journey-map-photo-marker', () => {
  it('renders a photo inside the pin bubble when a thumb url exists', () => {
    const point = createPhotoPoint()
    const pin = createJourneyMapPinElement(point, {
      [point.photoId]: 'blob:photo-thumb',
    })

    expect(pin.querySelector('.journey-map-pin__photo')).not.toBeNull()
    expect(pin.querySelector('.journey-map-pin__fallback')).toBeNull()
  })

  it('updates an existing pin when the thumb url arrives later', () => {
    const point = createPhotoPoint()
    const pin = createJourneyMapPinElement(point, {})

    expect(pin.querySelector('.journey-map-pin__fallback')).not.toBeNull()

    refreshJourneyMapPinElement(pin, point, {
      [point.photoId]: 'blob:photo-thumb',
    })

    const image = pin.querySelector('.journey-map-pin__photo')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('src')).toBe('blob:photo-thumb')
    expect(pin.querySelector('.journey-map-pin__fallback')).toBeNull()
  })

  it('uses the reader photo-bubble layout for photo pins', () => {
    const point = createPhotoPoint()
    const pin = createJourneyMapPinElement(
      point,
      { [point.photoId]: 'blob:photo-thumb' },
      { variant: 'reader' },
    )

    expect(pin.classList.contains('journey-map-pin--photo-bubble')).toBe(true)
    expect(pin.querySelector('.journey-map-pin__bubble--photo')).not.toBeNull()
    expect(pin.querySelector('.journey-map-pin__anchor')).not.toBeNull()
    expect(pin.querySelector('.journey-map-pin__tail')).toBeNull()
  })
  it('uses compact dots for reader moment pins', () => {
    const point = createMomentPoint()
    const pin = createJourneyMapPinElement(point, {}, { variant: 'reader' })

    expect(pin.classList.contains('journey-map-pin--compact')).toBe(true)
    expect(
      pin.querySelector('.journey-map-pin__bubble--compact'),
    ).not.toBeNull()
    expect(pin.querySelector('.journey-map-pin__tail')).toBeNull()
  })

  it('falls back when a photo thumb fails to load', () => {
    const point = createPhotoPoint()
    const pin = createJourneyMapPinElement(point, {
      [point.photoId]: 'blob:broken-thumb',
    })
    const image = pin.querySelector('.journey-map-pin__photo')

    expect(image).not.toBeNull()
    image?.dispatchEvent(new Event('error'))

    expect(pin.querySelector('.journey-map-pin__photo')).toBeNull()
    expect(pin.querySelector('.journey-map-pin__fallback')).not.toBeNull()
  })
})

function createMomentPoint(): JourneyMapPoint {
  return {
    category: null,
    checked: false,
    checklistItemId: null,
    entryId: crypto.randomUUID(),
    id: `moment:${crypto.randomUUID()}`,
    latitude: 50.1,
    longitude: 14.4,
    notes: '',
    photoId: null,
    stopId: null,
    title: 'Summit camp',
    type: 'moment',
  }
}

function createPhotoPoint(): JourneyMapPoint & { photoId: string } {
  const photoId = crypto.randomUUID()
  return {
    category: null,
    checked: false,
    checklistItemId: null,
    entryId: crypto.randomUUID(),
    id: `photo:${photoId}`,
    latitude: 50.1,
    longitude: 14.4,
    notes: '',
    photoId,
    stopId: null,
    title: 'Summit view',
    type: 'photo',
  }
}
