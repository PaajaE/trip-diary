/**
 * Stage colours shared by the editor (day strip, rail dots, map) and the
 * public reader (route line, card badge, stage strip, legend), cycled by
 * stage index so a stage keeps one colour everywhere.
 */
export const STAGE_PALETTE = [
  '#285943',
  '#ad563b',
  '#3b6ea5',
  '#8a5a9e',
  '#c49a2c',
  '#267a7a',
  '#a33b5c',
  '#5f7a2c',
] as const

export function stagePaletteColor(index: number): string {
  return STAGE_PALETTE[index % STAGE_PALETTE.length] ?? STAGE_PALETTE[0]
}

const INK = '#1f231e'

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** Text colour (white or the app ink) with the better WCAG contrast on `background`. */
export function readableOn(background: string): string {
  const bg = luminance(background)
  const whiteContrast = 1.05 / (bg + 0.05)
  const inkContrast = (bg + 0.05) / (luminance(INK) + 0.05)
  return whiteContrast >= inkContrast ? '#ffffff' : INK
}

/**
 * Stage colour for use as text on the page background: mixed with the theme's
 * foreground, so dark stage colours stay readable in dark mode (and light
 * ones in light mode).
 */
export function stageTextColor(color: string): string {
  return `color-mix(in srgb, ${color} 55%, var(--color-foreground))`
}
