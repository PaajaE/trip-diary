import { describe, expect, it } from 'vitest'
import { colors, spacing, theme } from './tokens'

describe('theme tokens', () => {
  it('exports color tokens', () => {
    expect(colors.background).toBe('#f7f4ed')
    expect(colors.primary).toBe('#3d6b4f')
    expect(colors.error).toBe('#9b2c2c')
  })

  it('exports spacing tokens', () => {
    expect(spacing.xs).toBeLessThan(spacing.sm)
    expect(spacing.lg).toBe(24)
  })

  it('groups tokens under theme', () => {
    expect(theme.colors).toBe(colors)
    expect(theme.spacing).toBe(spacing)
  })
})
