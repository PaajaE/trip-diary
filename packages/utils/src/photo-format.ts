/**
 * Detect HEIC/HEIF inputs that must not be uploaded as browser-renderable assets.
 */
export function isHeicLikeImageInput(input: {
  mimeType?: string | null
  nameOrUri?: string | null
}): boolean {
  const mime = (input.mimeType ?? '').toLowerCase()
  if (
    mime.includes('heic') ||
    mime.includes('heif') ||
    mime === 'image/heic-sequence' ||
    mime === 'image/heif-sequence'
  ) {
    return true
  }

  const name = (input.nameOrUri ?? '').toLowerCase()
  return (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    name.includes('.heic?') ||
    name.includes('.heif?')
  )
}

/** JPEG SOI marker. */
export function looksLikeJpegBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8
}

/** RIFF....WEBP */
export function looksLikeWebpBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
}
