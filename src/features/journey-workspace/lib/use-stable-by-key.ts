import { useState } from 'react'

/** Returns the previous `value` until `key` changes (keeps identity stable). */
export function useStableByKey<T>(value: T, key: string): T {
  const [kept, setKept] = useState({ key, value })
  if (kept.key === key) return kept.value
  setKept({ key, value })
  return value
}
