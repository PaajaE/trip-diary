function compareTimestampDesc(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftTime =
    left === null || left === undefined || left.trim() === ''
      ? null
      : new Date(left).valueOf()
  const rightTime =
    right === null || right === undefined || right.trim() === ''
      ? null
      : new Date(right).valueOf()

  if (
    (leftTime === null || Number.isNaN(leftTime)) &&
    (rightTime === null || Number.isNaN(rightTime))
  ) {
    return 0
  }

  if (leftTime === null || Number.isNaN(leftTime)) {
    return 1
  }

  if (rightTime === null || Number.isNaN(rightTime)) {
    return -1
  }

  return rightTime - leftTime
}

/** event_at DESC, created_at DESC, id DESC — null timestamps last. */
export function compareJourneyEntriesNewestFirst(
  left: { createdAt?: string | null; eventAt: string | null; id: string },
  right: { createdAt?: string | null; eventAt: string | null; id: string },
): number {
  const byEvent = compareTimestampDesc(left.eventAt, right.eventAt)
  if (byEvent !== 0) {
    return byEvent
  }

  const byCreated = compareTimestampDesc(left.createdAt, right.createdAt)
  if (byCreated !== 0) {
    return byCreated
  }

  return right.id.localeCompare(left.id)
}
