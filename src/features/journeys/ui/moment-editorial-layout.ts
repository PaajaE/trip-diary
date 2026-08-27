/** Outer page shell — ~1100px centered canvas. */
export const momentPageClass = 'mx-auto w-full max-w-[68.75rem]'

/** Editorial story text — ~720px readable width, centered in the canvas. */
export const momentTextColumnClass = 'mx-auto w-full max-w-[45rem]'

/** Visual canvas for cover, mosaic, map, and edit grid — same as page width. */
export const momentMediaColumnClass = 'mx-auto w-full max-w-[68.75rem]'

/** Responsive `sizes` for moment cover hero (~1100px canvas). */
export const MOMENT_COVER_SIZES =
  '(max-width: 640px) 100vw, min(68.75rem, 90vw)'

/** Responsive `sizes` for moment photo mosaic tiles. */
export const MOMENT_MOSAIC_SIZES =
  '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px'

/** Responsive `sizes` for the owner edit media grid. */
export const MOMENT_EDIT_GRID_SIZES =
  '(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 220px'
