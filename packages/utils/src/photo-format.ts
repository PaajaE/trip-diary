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

/**
 * HEIC/HEIF are ISO BMFF files whose `ftyp` brand is one of the HEIF brands.
 * Used when the picker reports image/jpeg but the bytes are still HEIC.
 */
export function looksLikeHeicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false
  }

  if (
    bytes[4] !== 0x66 ||
    bytes[5] !== 0x74 ||
    bytes[6] !== 0x79 ||
    bytes[7] !== 0x70
  ) {
    return false
  }

  const brand = String.fromCharCode(
    bytes[8] ?? 0,
    bytes[9] ?? 0,
    bytes[10] ?? 0,
    bytes[11] ?? 0,
  ).toLowerCase()

  return (
    brand === 'heic' ||
    brand === 'heif' ||
    brand === 'heix' ||
    brand === 'hevc' ||
    brand === 'hevx' ||
    brand === 'mif1' ||
    brand === 'msf1'
  )
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
