export interface CoverFocalPoint {
  x: number
  y: number
}

export const COVER_FOCAL_CENTER: CoverFocalPoint = { x: 0.5, y: 0.5 }

export function normalizeCoverFocalPoint(
  focalX?: number | null,
  focalY?: number | null,
): CoverFocalPoint | null {
  if (focalX === null || focalX === undefined) {
    return null
  }
  if (focalY === null || focalY === undefined) {
    return null
  }
  if (!Number.isFinite(focalX) || !Number.isFinite(focalY)) {
    return null
  }

  return {
    x: Math.min(1, Math.max(0, focalX)),
    y: Math.min(1, Math.max(0, focalY)),
  }
}

export function coverObjectPosition(
  focal: CoverFocalPoint | null | undefined,
  fallback = '50% 50%',
): string {
  if (focal === null || focal === undefined) {
    return fallback
  }

  return `${String(focal.x * 100)}% ${String(focal.y * 100)}%`
}

export function coverObjectPositionStyle(
  focal: CoverFocalPoint | null | undefined,
  fallback?: string,
): { objectPosition: string } {
  return { objectPosition: coverObjectPosition(focal, fallback) }
}

export function focalFromPreview(preview: {
  focalX?: number
  focalY?: number
  isCover?: boolean
}): CoverFocalPoint | null {
  if (preview.isCover !== true) {
    return null
  }
  return normalizeCoverFocalPoint(preview.focalX, preview.focalY)
}
