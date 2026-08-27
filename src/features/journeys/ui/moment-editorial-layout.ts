/** Outer page shell — up to ~1100px centered canvas. */
export const momentPageClass = 'mx-auto w-full max-w-[68.75rem]'

/** Editorial story text — ~720px readable width. */
export const momentTextColumnClass = 'w-full max-w-[45rem]'

/** Visual canvas for cover, mosaic, and map — ~1000px. */
export const momentMediaColumnClass = 'mx-auto w-full max-w-[62.5rem]'

/** Responsive `sizes` for moment cover hero (~1000px canvas). */
export const MOMENT_COVER_SIZES = '(max-width: 640px) 100vw, min(62.5rem, 90vw)'

/** Responsive `sizes` for moment photo mosaic tiles. */
export const MOMENT_MOSAIC_SIZES =
  '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px'
