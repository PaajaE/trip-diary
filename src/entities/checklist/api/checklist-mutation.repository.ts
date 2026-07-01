import { getChecklistTemplate } from '@/entities/checklist/data/templates'
import {
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
    return local
  }

  try {
    const remote = await listJourneyChecklistItemsRemote(journeyId)
    return mergeChecklistItems(remote, local)
  } catch {
    return local
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
    await saveLocalChecklistItem(
      localChecklistItemSchema.parse({
        ...localPending,
        checkedAt,
        updatedAt: new Date().toISOString(),
      }),
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
