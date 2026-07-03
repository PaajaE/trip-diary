import type { ChecklistItemCategory } from '@/entities/checklist/model/checklist'
import type { JourneyMapPoint } from '@/features/journeys/ui/journey-map-points'

const CATEGORY_RING: Record<ChecklistItemCategory, string> = {
  flora: '#3d9970',
  general: '#4a7c9b',
  geology: '#c87941',
  landmark: '#8b7ab8',
  wildlife: '#2f6b4f',
}

const CATEGORY_GRADIENT: Record<ChecklistItemCategory, string> = {
  flora: 'linear-gradient(145deg, #d8f3dc 0%, #52b788 100%)',
  general: 'linear-gradient(145deg, #dbeafe 0%, #4a7c9b 100%)',
  geology: 'linear-gradient(145deg, #f4e4d4 0%, #c87941 100%)',
  landmark: 'linear-gradient(145deg, #ebe4f7 0%, #8b7ab8 100%)',
  wildlife: 'linear-gradient(145deg, #d8f3dc 0%, #2f6b4f 100%)',
}

const CATEGORY_ICON: Record<ChecklistItemCategory, string> = {
  flora: '🌿',
  general: '✦',
  geology: '⛰',
  landmark: '📍',
  wildlife: '🦌',
}

const TYPE_RING: Record<JourneyMapPoint['type'], string> = {
  moment: '#285943',
  'nature-goal': '#2f6b4f',
  photo: '#1d6fa5',
  planned: '#bf6b3d',
}

export function createJourneyMapPinElement(
  point: JourneyMapPoint,
  photoThumbUrls: Record<string, string>,
  options?: { variant?: 'default' | 'reader' },
): HTMLElement {
  const isReader = options?.variant === 'reader'
  const isPhotoBubble =
    isReader && (point.type === 'photo' || point.photoId !== null)

  const pin = document.createElement('button')
  pin.type = 'button'
  pin.className = isReader
    ? 'journey-map-pin journey-map-pin--reader'
    : 'journey-map-pin'
  if (isPhotoBubble) {
    pin.classList.add('journey-map-pin--photo-bubble')
  }
  pin.setAttribute('aria-label', point.title)

  const bubble = document.createElement('div')
  bubble.className = 'journey-map-pin__bubble'
  if (isPhotoBubble) {
    bubble.classList.add('journey-map-pin__bubble--photo')
  }

  applyPinPhotoContent(bubble, point, photoThumbUrls, {
    eagerPhoto: isPhotoBubble,
  })

  const ringColor = getRingColor(point)
  bubble.style.setProperty('--pin-ring', ringColor)
  pin.style.setProperty('--pin-ring', ringColor)

  if (point.type === 'nature-goal' && !point.checked) {
    bubble.classList.add('journey-map-pin__bubble--wish')
  }

  if (point.type === 'nature-goal' && point.checked) {
    bubble.classList.add('journey-map-pin__bubble--visited')
    const badge = document.createElement('span')
    badge.className = 'journey-map-pin__badge'
    badge.setAttribute('aria-hidden', 'true')
    badge.textContent = '✓'
    bubble.append(badge)
  }

  if (isPhotoBubble) {
    const anchor = document.createElement('span')
    anchor.className = 'journey-map-pin__anchor'
    anchor.setAttribute('aria-hidden', 'true')
    pin.append(bubble, anchor)
    return pin
  }

  if (isReader) {
    pin.classList.add('journey-map-pin--compact')
    bubble.classList.add('journey-map-pin__bubble--compact')
    pin.append(bubble)
    return pin
  }

  const tail = document.createElement('div')
  tail.className = 'journey-map-pin__tail'
  tail.style.setProperty('--pin-ring', ringColor)

  pin.append(bubble, tail)
  return pin
}

export function refreshJourneyMapPinElement(
  pin: HTMLElement,
  point: JourneyMapPoint,
  photoThumbUrls: Record<string, string>,
): void {
  const bubble = pin.querySelector('.journey-map-pin__bubble')
  if (!(bubble instanceof HTMLElement)) {
    return
  }

  const isPhotoBubble = pin.classList.contains('journey-map-pin--photo-bubble')
  applyPinPhotoContent(bubble, point, photoThumbUrls, {
    eagerPhoto: isPhotoBubble,
  })
}

function applyPinPhotoContent(
  bubble: HTMLElement,
  point: JourneyMapPoint,
  photoThumbUrls: Record<string, string>,
  options?: { eagerPhoto?: boolean },
): void {
  const photoUrl = resolvePinPhotoUrl(point, photoThumbUrls)
  const existingImage = bubble.querySelector('.journey-map-pin__photo')
  const existingFallback = bubble.querySelector('.journey-map-pin__fallback')
  const badge = bubble.querySelector('.journey-map-pin__badge')

  if (photoUrl !== null) {
    if (existingImage instanceof HTMLImageElement) {
      if (existingImage.src !== photoUrl) {
        existingImage.onerror = () => {
          existingImage.remove()
          applyPinPhotoContent(bubble, point, {}, options)
        }
        existingImage.src = photoUrl
      }
      existingFallback?.remove()
      return
    }

    existingFallback?.remove()
    const image = document.createElement('img')
    image.alt = ''
    image.className = 'journey-map-pin__photo'
    image.decoding = 'async'
    image.loading = options?.eagerPhoto === true ? 'eager' : 'lazy'
    image.onerror = () => {
      image.remove()
      applyPinPhotoContent(bubble, point, {}, options)
    }
    image.src = photoUrl
    bubble.insertBefore(image, badge)
    return
  }

  if (existingImage instanceof HTMLImageElement) {
    existingImage.remove()
  }

  if (existingFallback instanceof HTMLElement) {
    return
  }

  const fallback = document.createElement('div')
  fallback.className = 'journey-map-pin__fallback'
  fallback.style.background = getFallbackGradient(point)
  fallback.textContent = getFallbackIcon(point)
  bubble.insertBefore(fallback, badge)
}

function resolvePinPhotoUrl(
  point: JourneyMapPoint,
  photoThumbUrls: Record<string, string>,
): string | null {
  if (point.photoId === null) {
    return null
  }

  return photoThumbUrls[point.photoId] ?? null
}

function getRingColor(point: JourneyMapPoint): string {
  if (point.type === 'nature-goal' && point.category !== null) {
    return CATEGORY_RING[point.category]
  }

  return TYPE_RING[point.type]
}

function getFallbackGradient(point: JourneyMapPoint): string {
  if (point.type === 'nature-goal' && point.category !== null) {
    return CATEGORY_GRADIENT[point.category]
  }

  if (point.type === 'photo') {
    return 'linear-gradient(145deg, #dbeafe 0%, #1d6fa5 100%)'
  }

  if (point.type === 'moment') {
    return 'linear-gradient(145deg, #d8f3dc 0%, #285943 100%)'
  }

  return 'linear-gradient(145deg, #f4e4d4 0%, #bf6b3d 100%)'
}

function getFallbackIcon(point: JourneyMapPoint): string {
  if (point.type === 'nature-goal' && point.category !== null) {
    return CATEGORY_ICON[point.category]
  }

  if (point.type === 'photo') {
    return '📷'
  }

  if (point.type === 'moment') {
    return '✦'
  }

  return '◎'
}
