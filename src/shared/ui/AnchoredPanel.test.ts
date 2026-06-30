import { describe, expect, it } from 'vitest'
import { clampPanelPosition } from '@/shared/ui/anchored-panel-position'

describe('clampPanelPosition', () => {
  it('keeps the panel inside the viewport when the trigger is near the left edge', () => {
    const trigger = {
      bottom: 64,
      height: 36,
      left: 180,
      right: 260,
      top: 28,
      width: 80,
      x: 180,
      y: 28,
    } as DOMRect

    const position = clampPanelPosition(trigger, 320)

    expect(position.left).toBeGreaterThanOrEqual(20)
    expect(position.left + position.width).toBeLessThanOrEqual(
      window.innerWidth - 20,
    )
    expect(position.top).toBe(72)
  })

  it('aligns to the trigger right edge when there is enough space', () => {
    const trigger = {
      bottom: 64,
      height: 36,
      left: 300,
      right: 380,
      top: 28,
      width: 80,
      x: 300,
      y: 28,
    } as DOMRect

    const position = clampPanelPosition(trigger, 320)

    expect(position.left).toBe(60)
    expect(position.width).toBe(320)
  })
})
