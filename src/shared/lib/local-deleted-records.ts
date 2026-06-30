import { localDb } from '@/shared/lib/local-db'

export type DeletedRecordKind =
  | 'entry'
  | 'guide'
  | 'journey'
  | 'photo'
  | 'stage'
  | 'stop'

export interface DeletedRecord {
  creatorId: string
  deletedAt: string
  id: string
  kind: DeletedRecordKind
}

export async function markDeletedRecord(record: DeletedRecord): Promise<void> {
  await localDb.deletedRecords.put(record)
}

export async function isRecordDeleted(
  kind: DeletedRecordKind,
  id: string,
): Promise<boolean> {
  const record = await localDb.deletedRecords.get(id)
  return record?.kind === kind
}

export async function listDeletedRecordIds(
  kind: DeletedRecordKind,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set()
  }

  const records = await localDb.deletedRecords.where('id').anyOf(ids).toArray()
  return new Set(
    records.filter((record) => record.kind === kind).map((record) => record.id),
  )
}

export async function clearDeletedRecord(id: string): Promise<void> {
  await localDb.deletedRecords.delete(id)
}
