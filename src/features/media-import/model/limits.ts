/**
 * Hard limit of media per import batch (Phase 4d). A bigger selection is not
 * queued; the user splits it by date range instead.
 */
export const MAX_IMPORT_BATCH = 500
