export function clampPanelPosition(
  trigger: DOMRect,
  panelWidth: number,
): { left: number; top: number; width: number } {
  const VIEWPORT_PADDING_PX = 20
  const PANEL_GAP_PX = 8
  const MAX_PANEL_WIDTH_PX = 320

  const width = Math.min(
    MAX_PANEL_WIDTH_PX,
    panelWidth,
    window.innerWidth - VIEWPORT_PADDING_PX * 2,
  )
  const preferredLeft = trigger.right - width
  const left = Math.min(
    Math.max(VIEWPORT_PADDING_PX, preferredLeft),
    window.innerWidth - width - VIEWPORT_PADDING_PX,
  )
  const top = trigger.bottom + PANEL_GAP_PX

  return { left, top, width }
}
