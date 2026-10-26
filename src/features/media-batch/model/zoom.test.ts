import { describe, expect, it } from 'vitest'
import {
  clampView,
  cycleZoom,
  FIT_VIEW,
  fitScaleOf,
  fitSize,
  maxK,
  nextZoomK,
  panBy,
  translateOf,
  viewForPane,
  zoomAt,
} from '@/features/media-batch/model/zoom'

const pane = { h: 600, w: 800 }
// A 4000 x 3000 photo in an 800 x 600 pane: fitted at 20 %.
const fit = fitSize(pane, 4 / 3)
const fs = fitScaleOf(fit, 4000)

describe('fit', () => {
  it('fits by the limiting side and reports the real scale', () => {
    expect(fit).toEqual({ h: 600, w: 800 })
    expect(fs).toBeCloseTo(0.2)
    expect(fitSize({ h: 300, w: 800 }, 4 / 3)).toEqual({ h: 300, w: 400 })
    expect(fitSize({ h: 0, w: 800 }, 1)).toEqual({ h: 0, w: 0 })
    expect(fitScaleOf({ h: 0, w: 0 }, 4000)).toBe(1)
  })
})

describe('level cycling', () => {
  it('goes Fit -> 100 % -> 200 % -> Fit in real scale', () => {
    const one = nextZoomK(1, fs)
    expect(one * fs).toBeCloseTo(1)
    const two = nextZoomK(one, fs)
    expect(two * fs).toBeCloseTo(2)
    expect(nextZoomK(two, fs)).toBe(1)
  })

  it('skips levels the fitted photo already exceeds', () => {
    // fitted at 150 %: 100 % is below fit, so the first level is 200 %
    expect(nextZoomK(1, 1.5) * 1.5).toBeCloseTo(2)
    // fitted at 300 %: no level is larger than fit, stay on fit
    expect(nextZoomK(1, 3)).toBe(1)
  })

  it('limits the factor to a real scale of 400 %', () => {
    expect(maxK(fs) * fs).toBeCloseTo(4)
    expect(maxK(10)).toBe(1)
  })
})

describe('zoomAt', () => {
  it('keeps the image point under the pointer fixed', () => {
    const at = { x: 200, y: -100 } // right of and above the centre
    const k = nextZoomK(1, fs)
    const view = zoomAt(FIT_VIEW, k, at, fit, pane, fs)
    // the point under `at` before: 0.5 + 200/800, 0.5 - 100/600
    const before = { x: 0.5 + 200 / 800, y: 0.5 - 100 / 600 }
    const after = {
      x: view.cx + at.x / (fit.w * view.k),
      y: view.cy + at.y / (fit.h * view.k),
    }
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('falls back to fit at or below factor 1', () => {
    expect(
      zoomAt({ cx: 0.2, cy: 0.2, k: 3 }, 0.5, { x: 0, y: 0 }, fit, pane, fs),
    ).toEqual(FIT_VIEW)
  })

  it('works on a pane of unknown size (no division by zero)', () => {
    const none = { h: 0, w: 0 }
    expect(cycleZoom(FIT_VIEW, { x: 0, y: 0 }, none, none, 1).k).toBe(2)
  })

  it('the same relative view lands on the same point in a different pane', () => {
    const other = { h: 300, w: 400 }
    const otherFit = fitSize(other, 4 / 3)
    const view = zoomAt(FIT_VIEW, 5, { x: 100, y: 50 }, fit, pane, fs)
    const a = translateOf(viewForPane(view, fit, pane), fit)
    const b = translateOf(viewForPane(view, otherFit, other), otherFit)
    // half-size pane -> half the pixel translation
    expect(b.x).toBeCloseTo(a.x / 2)
    expect(b.y).toBeCloseTo(a.y / 2)
  })
})

describe('pan and clamp', () => {
  it('drags the photo with the pointer and stops at the edges', () => {
    const zoomed = { cx: 0.5, cy: 0.5, k: 4 }
    const moved = panBy(zoomed, 100, 0, fit, pane)
    expect(moved.cx).toBeLessThan(0.5)
    const edge = panBy(zoomed, 1e6, 1e6, fit, pane)
    expect(edge.cx).toBeCloseTo(1 / 8) // half of the visible 1/4
    expect(edge.cy).toBeCloseTo(1 / 8)
  })

  it('does not pan at fit and centres an axis that fits', () => {
    expect(panBy(FIT_VIEW, 50, 50, fit, pane)).toBe(FIT_VIEW)
    expect(clampView({ cx: 0.1, cy: 0.9, k: 1.2 }, fit, pane).cx).toBeCloseTo(
      0.5 / 1.2,
    )
    expect(clampView({ cx: 0.9, cy: 0.9, k: 1 }, fit, pane)).toEqual(FIT_VIEW)
  })
})
