/**
 * Pure zoom math shared by the compare view. The view is expressed relative to
 * the image, so two photos of different size stay on the same point:
 * `k` is the factor over the "fit" size (1 = whole photo), `cx`/`cy` the
 * relative image point (0..1) shown in the centre of the pane.
 */
export interface ZoomView {
  k: number
  cx: number
  cy: number
}

export interface Size {
  w: number
  h: number
}

/** Offset of a point from the pane centre, in CSS px. */
export interface Point {
  x: number
  y: number
}

export const FIT_VIEW: ZoomView = { cx: 0.5, cy: 0.5, k: 1 }
/** Real scales (image px per CSS px) the Z key / double-tap steps through. */
export const ZOOM_REAL_LEVELS: readonly number[] = [1, 2]
/** Upper bound for pinch and Ctrl+wheel. */
export const MAX_REAL_SCALE = 4
const EPS = 0.001

/** The size of `aspect` (w / h) fitted into the pane (object-contain). */
export function fitSize(pane: Size, aspect: number): Size {
  if (!(pane.w > 0) || !(pane.h > 0) || !(aspect > 0)) return { h: 0, w: 0 }
  return pane.w / pane.h > aspect
    ? { h: pane.h, w: pane.h * aspect }
    : { h: pane.w / aspect, w: pane.w }
}

/** Real scale of the fitted photo (fitted width / pixel width); 1 if unknown. */
export function fitScaleOf(fit: Size, naturalWidth: number): number {
  return fit.w > 0 && naturalWidth > 0 ? fit.w / naturalWidth : 1
}

export const realScale = (k: number, fitScale: number): number => k * fitScale

export function isZoomed(view: ZoomView): boolean {
  return view.k > 1 + EPS
}

/** Largest allowed factor; never below 1. */
export function maxK(fitScale: number): number {
  return Math.max(1, MAX_REAL_SCALE / fitScale)
}

export function clampK(k: number, fitScale: number): number {
  return Math.min(maxK(fitScale), Math.max(1, k))
}

/**
 * Next level of the cycle Fit -> 100 % -> 200 % -> Fit. Levels that are not
 * larger than the current one (a small photo already fitted above 100 %) are
 * skipped.
 */
export function nextZoomK(k: number, fitScale: number): number {
  const limit = maxK(fitScale)
  for (const level of ZOOM_REAL_LEVELS) {
    const target = level / fitScale
    if (target > k + EPS && target <= limit + EPS) return target
  }
  return 1
}

/** Keeps the shown part inside the photo; centres an axis that fits entirely. */
export function clampView(view: ZoomView, fit: Size, pane: Size): ZoomView {
  const axis = (c: number, size: number, paneSize: number): number => {
    if (!(size > 0)) return c
    const half = paneSize / (2 * size * view.k)
    if (half >= 0.5) return 0.5
    return Math.min(1 - half, Math.max(half, c))
  }
  return {
    cx: axis(view.cx, fit.w, pane.w),
    cy: axis(view.cy, fit.h, pane.h),
    k: view.k,
  }
}

/** Sets the factor so the image point under `at` stays under `at`. */
export function zoomAt(
  view: ZoomView,
  nextK: number,
  at: Point,
  fit: Size,
  pane: Size,
  fitScale: number,
): ZoomView {
  const k = clampK(nextK, fitScale)
  if (k <= 1 + EPS) return FIT_VIEW
  if (!(fit.w > 0) || !(fit.h > 0)) return { ...view, k }
  const px = view.cx + at.x / (fit.w * view.k)
  const py = view.cy + at.y / (fit.h * view.k)
  return clampView(
    { cx: px - at.x / (fit.w * k), cy: py - at.y / (fit.h * k), k },
    fit,
    pane,
  )
}

/** One Z / double-tap step at `at`. */
export function cycleZoom(
  view: ZoomView,
  at: Point,
  fit: Size,
  pane: Size,
  fitScale: number,
): ZoomView {
  return zoomAt(view, nextZoomK(view.k, fitScale), at, fit, pane, fitScale)
}

/** Drag by (dx, dy) CSS px: the photo follows the pointer. */
export function panBy(
  view: ZoomView,
  dx: number,
  dy: number,
  fit: Size,
  pane: Size,
): ZoomView {
  if (!isZoomed(view) || !(fit.w > 0) || !(fit.h > 0)) return view
  return clampView(
    {
      cx: view.cx - dx / (fit.w * view.k),
      cy: view.cy - dy / (fit.h * view.k),
      k: view.k,
    },
    fit,
    pane,
  )
}

/** The view as it must be drawn in one pane (clamped for that pane's size). */
export function viewForPane(view: ZoomView, fit: Size, pane: Size): ZoomView {
  return isZoomed(view) ? clampView(view, fit, pane) : FIT_VIEW
}

/** CSS translate (px) that puts the view centre in the middle of the pane. */
export function translateOf(view: ZoomView, fit: Size): Point {
  return {
    x: -(view.cx - 0.5) * fit.w * view.k,
    y: -(view.cy - 0.5) * fit.h * view.k,
  }
}
