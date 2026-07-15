/**
 * Creates a RFC 4122 version 4 UUID.
 * Hermes often lacks `crypto.randomUUID` (and sometimes `crypto` entirely).
 */
export function createUuid(): string {
  // DOM typings treat crypto as always present; Hermes may not have it at runtime.
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto

  if (cryptoApi !== undefined && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (
    cryptoApi !== undefined &&
    typeof cryptoApi.getRandomValues === 'function'
  ) {
    cryptoApi.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  // Version 4 + RFC 4122 variant bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
