import { getChecklistTemplate } from '@/entities/checklist/data/templates'
import {
  getJourneySnapshotChecklist,
  removeChecklistItemsFromSnapshot,
} from '@/entities/journey/api/local-journey-cache.repository'
import {
  deleteJourneyChecklistItemRemote,
  insertJourneyChecklistItemRemote,
  listJourneyChecklistItemsRemote,
  updateJourneyChecklistItemRemote,
} from '@/entities/checklist/api/checklist.repository'
import {
  listLocalChecklistItems,
  listPendingLocalChecklistItems,
  saveLocalChecklistItem,
} from '@/entities/checklist/api/local-checklist.repository'
import {
  journeyChecklistItemSchema,
  localChecklistItemSchema,
  type JourneyChecklistItem,
} from '@/entities/checklist/model/checklist'
import {
  addJourneyStop,
  deleteJourneyStop,
  setJourneyStopLocation,
  setJourneyStopStatus,
} from '@/entities/journey/api/local-journey-structure.repository'
import { localDb } from '@/shared/lib/local-db'
import { isBrowserOnline } from '@/shared/lib/network'
import { syncOperationSchema } from '@/shared/sync/sync-operation'

function mergeChecklistItems(
  remote: JourneyChecklistItem[],
  local: JourneyChecklistItem[],
): JourneyChecklistItem[] {
  const merged = new Map<string, JourneyChecklistItem>()
  for (const item of remote) {
    merged.set(item.id, item)
  }
  for (const item of local) {
    const existing = merged.get(item.id)
    if (existing === undefined) {
      merged.set(item.id, item)
      continue
    }
    merged.set(item.id, {
      ...existing,
      checkedAt: item.checkedAt ?? existing.checkedAt,
      entryId: item.entryId ?? existing.entryId,
      stopId: item.stopId ?? existing.stopId,
    })
  }
  return [...merged.values()].sort(
    (left, right) => left.position - right.position,
  )
}

export async function listJourneyChecklistItems(
  journeyId: string,
): Promise<JourneyChecklistItem[]> {
  const local = await listLocalChecklistItems(journeyId)

  if (!isBrowserOnline()) {
    if (local.length > 0) {
      return local
    }
    return (await getJourneySnapshotChecklist(journeyId)) ?? []
  }

  try {
    const remote = await listJourneyChecklistItemsRemote(journeyId)
    return mergeChecklistItems(remote, local)
  } catch {
    if (local.length > 0) {
      return local
    }
    return (await getJourneySnapshotChecklist(journeyId)) ?? []
  }
}

export async function applyChecklistTemplate(input: {
  creatorId: string
  journeyId: string
  templateSlug: string
  translate: (key: string) => string
}): Promise<void> {
  const template = getChecklistTemplate(input.templateSlug)
  if (template === undefined) {
    throw new Error('Unknown checklist template')
  }

  const existing = await listJourneyChecklistItems(input.journeyId)
  const alreadyApplied = existing.some(
    (item) => item.templateSlug === input.templateSlug,
  )
  if (alreadyApplied) {
    return
  }

  const now = new Date().toISOString()

  for (const [index, templateItem] of template.items.entries()) {
    const title = input.translate(templateItem.titleKey)
    const notes =
      templateItem.notesKey === undefined
        ? ''
        : input.translate(templateItem.notesKey)
    let stopId: string | null = null

    if (templateItem.createPlannedStop === true) {
      stopId = await addJourneyStop(
        input.creatorId,
        input.journeyId,
        null,
        title,
        notes,
      )
      if (
        templateItem.latitude !== undefined &&
        templateItem.longitude !== undefined
      ) {
        await setJourneyStopLocation(
          stopId,
          templateItem.latitude,
          templateItem.longitude,
        )
      }
    }

    const id = crypto.randomUUID()
    const localItem = localChecklistItemSchema.parse({
      category: templateItem.category,
      checkedAt: null,
      creatorId: input.creatorId,
      entryId: null,
      id,
      itemSlug: templateItem.slug,
      journeyId: input.journeyId,
      notes,
      position: index,
      stopId,
      syncStatus: 'pending',
      templateSlug: input.templateSlug,
      title,
      updatedAt: now,
    })

    if (isBrowserOnline()) {
      try {
        await insertJourneyChecklistItemRemote({
          category: localItem.category,
          creatorId: input.creatorId,
          id: localItem.id,
          itemSlug: localItem.itemSlug,
          journeyId: input.journeyId,
          notes: localItem.notes,
          position: localItem.position,
          stopId: localItem.stopId,
          templateSlug: localItem.templateSlug,
          title: localItem.title,
        })
        continue
      } catch {
        // Fall back to local queue below.
      }
    }

    await localDb.transaction(
      'rw',
      localDb.localChecklistItems,
      localDb.syncOperations,
      async () => {
        await saveLocalChecklistItem(localItem)
        await localDb.syncOperations.add(
          syncOperationSchema.parse({
            checklistItemId: localItem.id,
            createdAt: now,
            creatorId: input.creatorId,
            id: crypto.randomUUID(),
            journeyId: input.journeyId,
            status: 'pending',
            type: 'checklist_item.create',
          }),
        )
      },
    )
  }
}

export async function setJourneyChecklistItemChecked(input: {
  checked: boolean
  creatorId: string
  item: JourneyChecklistItem
  journeyId: string
}): Promise<JourneyChecklistItem> {
  const checkedAt = input.checked ? new Date().toISOString() : null
  const updated = journeyChecklistItemSchema.parse({
    ...input.item,
    checkedAt,
  })

  if (input.item.stopId !== null) {
    await setJourneyStopStatus(
      input.creatorId,
      input.journeyId,
      input.item.stopId,
      input.checked ? 'visited' : 'planned',
    )
  }

  const pending = await listPendingLocalChecklistItems(input.journeyId)
  const localPending = pending.find((item) => item.id === input.item.id)

  if (localPending !== undefined) {
    const now = new Date().toISOString()
    await localDb.transaction(
      'rw',
      localDb.localChecklistItems,
      localDb.syncOperations,
      async () => {
        await saveLocalChecklistItem(
          localChecklistItemSchema.parse({
            ...localPending,
            checkedAt,
            updatedAt: now,
          }),
        )
        const existingUpdate = await localDb.syncOperations
          .filter(
            (operation) =>
              operation.type === 'checklist_item.update' &&
              operation.checklistItemId === input.item.id,
          )
          .first()
        if (existingUpdate === undefined) {
          await localDb.syncOperations.add(
            syncOperationSchema.parse({
              checklistItemId: input.item.id,
              createdAt: now,
              creatorId: input.creatorId,
              id: crypto.randomUUID(),
              journeyId: input.journeyId,
              status: 'pending',
              type: 'checklist_item.update',
            }),
          )
        }
      },
    )
    return updated
  }

  if (isBrowserOnline()) {
    try {
      await updateJourneyChecklistItemRemote({
        checkedAt,
        entryId: input.item.entryId,
        id: input.item.id,
        stopId: input.item.stopId,
      })
      return updated
    } catch {
      // Fall back to local update queue.
    }
  }

  const now = new Date().toISOString()
  await localDb.transaction(
    'rw',
    localDb.localChecklistItems,
    localDb.syncOperations,
    async () => {
      await saveLocalChecklistItem(
        localChecklistItemSchema.parse({
          category: input.item.category,
          checkedAt,
          creatorId: input.creatorId,
          entryId: input.item.entryId,
          id: input.item.id,
          itemSlug: input.item.itemSlug,
          journeyId: input.journeyId,
          notes: input.item.notes,
          position: input.item.position,
          stopId: input.item.stopId,
          syncStatus: 'pending',
          templateSlug: input.item.templateSlug,
          title: input.item.title,
          updatedAt: now,
        }),
      )
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          checklistItemId: input.item.id,
          createdAt: now,
          creatorId: input.creatorId,
          id: crypto.randomUUID(),
          journeyId: input.journeyId,
          status: 'pending',
          type: 'checklist_item.update',
        }),
      )
    },
  )

  return updated
}

export async function clearChecklistItemStop(input: {
  creatorId: string
  item: JourneyChecklistItem
  journeyId: string
}): Promise<void> {
  if (input.item.stopId === null) {
    return
  }

  if (isBrowserOnline()) {
    try {
      await updateJourneyChecklistItemRemote({
        checkedAt: input.item.checkedAt,
        entryId: input.item.entryId,
        id: input.item.id,
        stopId: null,
      })
      return
    } catch {
      // Fall back to local update queue.
    }
  }

  const now = new Date().toISOString()
  const pending = await listPendingLocalChecklistItems(input.journeyId)
  const localPending = pending.find((item) => item.id === input.item.id)

  await localDb.transaction(
    'rw',
    localDb.localChecklistItems,
    localDb.syncOperations,
    async () => {
      const base =
        localPending ??
        localChecklistItemSchema.parse({
          category: input.item.category,
          checkedAt: input.item.checkedAt,
          creatorId: input.creatorId,
          entryId: input.item.entryId,
          id: input.item.id,
          itemSlug: input.item.itemSlug,
          journeyId: input.journeyId,
          notes: input.item.notes,
          position: input.item.position,
          stopId: input.item.stopId,
          syncStatus: 'pending',
          templateSlug: input.item.templateSlug,
          title: input.item.title,
          updatedAt: now,
        })
      await saveLocalChecklistItem(
        localChecklistItemSchema.parse({
          ...base,
          stopId: null,
          updatedAt: now,
        }),
      )
      const existingUpdate = await localDb.syncOperations
        .filter(
          (operation) =>
            operation.type === 'checklist_item.update' &&
            operation.checklistItemId === input.item.id,
        )
        .first()
      if (existingUpdate === undefined) {
        await localDb.syncOperations.add(
          syncOperationSchema.parse({
            checklistItemId: input.item.id,
            createdAt: now,
            creatorId: input.creatorId,
            id: crypto.randomUUID(),
            journeyId: input.journeyId,
            status: 'pending',
            type: 'checklist_item.update',
          }),
        )
      }
    },
  )
}

export async function createCustomChecklistItem(input: {
  category: JourneyChecklistItem['category']
  creatorId: string
  journeyId: string
  latitude?: number | null
  longitude?: number | null
  notes?: string
  title: string
}): Promise<JourneyChecklistItem> {
  const existing = await listJourneyChecklistItems(input.journeyId)
  const itemSlug = crypto.randomUUID()
  const now = new Date().toISOString()
  let stopId: string | null = null

  const latitude = input.latitude
  const longitude = input.longitude
  if (
    latitude != null &&
    longitude != null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    stopId = await addJourneyStop(
      input.creatorId,
      input.journeyId,
      null,
      input.title.trim(),
      input.notes?.trim() ?? '',
    )
    await setJourneyStopLocation(stopId, latitude, longitude)
  }

  const id = crypto.randomUUID()
  const item = journeyChecklistItemSchema.parse({
    category: input.category,
    checkedAt: null,
    entryId: null,
    id,
    itemSlug,
    notes: input.notes?.trim() ?? '',
    position: existing.length,
    stopId,
    templateSlug: 'custom',
    title: input.title.trim(),
  })

  const localItem = localChecklistItemSchema.parse({
    ...item,
    creatorId: input.creatorId,
    journeyId: input.journeyId,
    syncStatus: 'pending',
    updatedAt: now,
  })

  if (isBrowserOnline()) {
    try {
      await insertJourneyChecklistItemRemote({
        category: item.category,
        creatorId: input.creatorId,
        id: item.id,
        itemSlug: item.itemSlug,
        journeyId: input.journeyId,
        notes: item.notes,
        position: item.position,
        stopId: item.stopId,
        templateSlug: item.templateSlug,
        title: item.title,
      })
      return item
    } catch {
      // Fall back to local queue below.
    }
  }

  await localDb.transaction(
    'rw',
    localDb.localChecklistItems,
    localDb.syncOperations,
    async () => {
      await saveLocalChecklistItem(localItem)
      await localDb.syncOperations.add(
        syncOperationSchema.parse({
          checklistItemId: item.id,
          createdAt: now,
          creatorId: input.creatorId,
          id: crypto.randomUUID(),
          journeyId: input.journeyId,
          status: 'pending',
          type: 'checklist_item.create',
        }),
      )
    },
  )

  return item
}

type PendingChecklistPurgeResult = 'none' | 'pending_create' | 'pending_update'

async function purgePendingChecklistItem(
  checklistItemId: string,
): Promise<PendingChecklistPurgeResult> {
  const local = await localDb.localChecklistItems.get(checklistItemId)
  if (local === undefined) {
    return 'none'
  }

  const hasCreateOp =
    (await localDb.syncOperations
      .filter(
        (operation) =>
          operation.type === 'checklist_item.create' &&
          operation.checklistItemId === checklistItemId,
      )
      .first()) !== undefined

  await localDb.transaction(
    'rw',
    localDb.localChecklistItems,
    localDb.syncOperations,
    async () => {
      await localDb.syncOperations
        .filter(
          (operation) =>
            (operation.type === 'checklist_item.create' ||
              operation.type === 'checklist_item.update') &&
            operation.checklistItemId === checklistItemId,
        )
        .delete()
      await localDb.localChecklistItems.delete(checklistItemId)
    },
  )

  return hasCreateOp ? 'pending_create' : 'pending_update'
}

async function queueChecklistItemDelete(
  creatorId: string,
  journeyId: string,
  checklistItemId: string,
): Promise<void> {
  const now = new Date().toISOString()
  await localDb.transaction('rw', localDb.syncOperations, async () => {
    const existing = await localDb.syncOperations
      .filter(
        (operation) =>
          operation.type === 'checklist_item.delete' &&
          operation.checklistItemId === checklistItemId,
      )
      .first()
    if (existing !== undefined) {
      return
    }

    await localDb.syncOperations.add(
      syncOperationSchema.parse({
        checklistItemId,
        createdAt: now,
        creatorId,
        id: crypto.randomUUID(),
        journeyId,
        status: 'pending',
        type: 'checklist_item.delete',
      }),
    )
  })
}

async function deleteSyncedChecklistItem(input: {
  checklistItemId: string
  creatorId: string
  journeyId: string
}): Promise<void> {
  if (isBrowserOnline()) {
    try {
      await deleteJourneyChecklistItemRemote(input.checklistItemId)
      return
    } catch {
      // Fall back to local delete queue.
    }
  }

  await queueChecklistItemDelete(
    input.creatorId,
    input.journeyId,
    input.checklistItemId,
  )
}

export async function removeChecklistTemplate(input: {
  creatorId: string
  journeyId: string
  templateSlug: string
}): Promise<void> {
  const items = (await listJourneyChecklistItems(input.journeyId)).filter(
    (item) => item.templateSlug === input.templateSlug,
  )
  const removedIds: string[] = []

  for (const item of items) {
    removedIds.push(item.id)
    const purgeResult = await purgePendingChecklistItem(item.id)

    if (purgeResult !== 'pending_create') {
      await deleteSyncedChecklistItem({
        checklistItemId: item.id,
        creatorId: input.creatorId,
        journeyId: input.journeyId,
      })
    }

    if (item.stopId !== null) {
      await deleteJourneyStop(input.creatorId, input.journeyId, item.stopId)
    }
  }

  if (removedIds.length > 0) {
    await removeChecklistItemsFromSnapshot(input.journeyId, removedIds)
  }
}
