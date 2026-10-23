/**
 * Stage colours shared by the editor (day strip, rail dots, map) and the
 * public reader (route line, card badge, stage strip, legend), cycled by
 * stage index so a stage keeps one colour everywhere.
 */
export const STAGE_PALETTE = [
  '#285943',
  '#b85f42',
  '#3b6ea5',
  '#8a5a9e',
  '#c49a2c',
  '#2c8a8a',
  '#a33b5c',
  '#5f7a2c',
] as const

export function stagePaletteColor(index: number): string {
  return STAGE_PALETTE[index % STAGE_PALETTE.length] ?? STAGE_PALETTE[0]
}
