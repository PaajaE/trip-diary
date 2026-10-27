/**
 * Where the flow goes next. The sorting step (step 2 of 2) is built by the
 * following task; until then "Zastávky sedí, třídit fotky" leads to the
 * existing batch screen. Change this one constant to plug the new screen in.
 */
export const SORTING_ROUTE = '/j/$journeyId/batch' as const
