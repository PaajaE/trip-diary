/** Kontrola zastávek of one day (step 1 of 2). */
export const REVIEW_ROUTE = '/j/$journeyId/flow/$dayKey' as const

/** Třídění of one day (step 2 of 2): "Zastávky sedí, třídit fotky" goes here. */
export const SORTING_ROUTE = '/j/$journeyId/flow/$dayKey/sort' as const
