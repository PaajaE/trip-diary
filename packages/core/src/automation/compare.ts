/**
 * The one string comparator of the automation: plain UTF-16 code unit order.
 * `localeCompare` depends on the runtime locale and ICU data, which would make
 * the result (and so stable ids) differ between devices.
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
