const MAX_DEVICE_LENGTH = 120
// C0/C1 controls (incl. NUL), DEL, line/paragraph separators, zero-width and BOM.
const CONTROL_PATTERN =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200d\ufeff]/g

function clean(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_PATTERN, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Display name of the capture device from EXIF Make and Model. The make is not
 * repeated when the model already starts with it (case-insensitive). Capped at
 * 120 characters (the DB limit), cut on a word boundary when possible and never
 * inside a surrogate pair. Null when nothing usable is left.
 */
export function normalizeDevice(make: unknown, model: unknown): string | null {
  const cleanMake = clean(make)
  const cleanModel = clean(model)
  let name: string
  if (cleanMake === '') {
    name = cleanModel
  } else if (cleanModel === '') {
    name = cleanMake
  } else if (cleanModel.toLowerCase().startsWith(cleanMake.toLowerCase())) {
    name = cleanModel
  } else {
    name = `${cleanMake} ${cleanModel}`
  }
  if (name === '') return null
  if (name.length <= MAX_DEVICE_LENGTH) return name

  let cut = name.slice(0, MAX_DEVICE_LENGTH)
  const next = name.charAt(MAX_DEVICE_LENGTH)
  if (next !== ' ') {
    const space = cut.lastIndexOf(' ')
    if (space > 0) cut = cut.slice(0, space)
  }
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  cut = cut.trim()
  return cut === '' ? null : cut
}
