export interface Dimensions {
  height: number
  width: number
}

export function calculateDimensions(
  source: Dimensions,
  maxWidth: number,
): Dimensions {
  if (source.width <= maxWidth) {
    return {
      height: source.height,
      width: source.width,
    }
  }

  const scale = maxWidth / source.width
  return {
    height: Math.max(1, Math.round(source.height * scale)),
    width: maxWidth,
  }
}
