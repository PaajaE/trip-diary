export const colors = {
  background: '#f7f4ed',
  border: '#d8dfd3',
  error: '#9b2c2c',
  primary: '#3d6b4f',
  surface: '#ffffff',
  text: '#20231f',
  textMuted: '#5c6358',
  textSubtle: '#7a8276',
} as const

export const spacing = {
  lg: 24,
  md: 16,
  sm: 12,
  xl: 32,
  xs: 8,
} as const

export const theme = {
  colors,
  spacing,
} as const

export type Theme = typeof theme
