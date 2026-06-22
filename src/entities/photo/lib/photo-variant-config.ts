import type { PhotoVariantKind } from '@/entities/photo/model/photo'

export interface PhotoVariantSizeConfig {
  kind: PhotoVariantKind
  maxWidth: number
  quality: number
}

// thumb ~400px for grids; preview ~1000px for detail views. No originals/large.
export const LOCAL_PHOTO_VARIANT_SIZES: PhotoVariantSizeConfig[] = [
  { kind: 'thumb', maxWidth: 400, quality: 0.72 },
  { kind: 'preview', maxWidth: 1000, quality: 0.78 },
]

export const SYNC_PHOTO_VARIANT_KINDS = new Set<PhotoVariantKind>([
  'thumb',
  'preview',
])
