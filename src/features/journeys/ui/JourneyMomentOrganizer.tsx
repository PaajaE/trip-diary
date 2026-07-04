import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { updateEntry } from '@/entities/entry/api/entry-mutation.repository'
import { getLocalEntry } from '@/entities/entry/api/local-entry.repository'
import { moveJourneyMomentToStage } from '@/entities/journey/api/journey.repository'
import type { JourneyDetail } from '@/entities/journey/model/journey'
import { composeJourneyContent } from '@/features/journeys/lib/journey-content'
import {
  eventAtForDayKey,
  formatJourneyMomentGroupTarget,
  getCurrentMomentGroupTarget,
  getJourneyStageContentKey,
  getJourneyStageContentLabel,
  getMomentDayKey,
  parseJourneyMomentGroupTarget,
  UNDATED_DAY_KEY,
} from '@/features/journeys/lib/journey-stage-label'
import { canAutomaticallySync } from '@/shared/sync/auto-sync'
import { syncPendingOperations } from '@/shared/sync/sync.service'

interface JourneyMomentOrganizerProps {
  creatorId: string
  journey: JourneyDetail
  onChanged: () => void
}

export function JourneyMomentOrganizer({
  creatorId,
  journey,
  onChanged,
}: JourneyMomentOrganizerProps) {
  const { i18n, t } = useTranslation()
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null)
  const [failedEntryId, setFailedEntryId] = useState<string | null>(null)
  const content = composeJourneyContent(journey)
  const validStageIds = new Set(journey.stages.map((stage) => stage.id))
  const dayKeys = new Set<string>()

  for (const moment of content.moments) {
    if (
      moment.entry.stageId === null ||
      !validStageIds.has(moment.entry.stageId)
    ) {
      dayKeys.add(getMomentDayKey(moment.entry.eventAt))
    }
  }

  const moveTargets = [
    ...journey.stages.map((stage) => ({
      label: stage.title,
      value: formatJourneyMomentGroupTarget({
        kind: 'stage',
        stageId: stage.id,
      }),
    })),
    ...[...dayKeys]
      .sort((left, right) => {
        if (left === UNDATED_DAY_KEY) {
          return 1
        }
        if (right === UNDATED_DAY_KEY) {
          return -1
        }
        return left.localeCompare(right)
      })
      .map((dayKey) => ({
        label:
          dayKey === UNDATED_DAY_KEY
            ? t('journey.undatedMoments')
            : getJourneyStageContentLabel(
                {
                  dayKey,
                  moments: [],
                  plannedStops: [],
                  stage: null,
                },
                t,
                i18n.language,
              ),
        value: formatJourneyMomentGroupTarget({ dayKey, kind: 'day' }),
      })),
  ]

  if (content.moments.length === 0) {
    return null
  }

  async function handleMove(
    entryId: string,
    stopId: string | null,
    eventAt: string | null,
    nextValue: string,
  ) {
    const target = parseJourneyMomentGroupTarget(nextValue)
    if (target === null) {
      return
    }

    setBusyEntryId(entryId)
    setFailedEntryId(null)

    try {
      if (target.kind === 'stage') {
        await moveJourneyMomentToStage({
          creatorId,
          entryId,
          journeyId: journey.id,
          stageId: target.stageId,
          stopId,
        })
      } else {
        const nextEventAt = eventAtForDayKey(target.dayKey, eventAt)
        if (nextEventAt !== null && nextEventAt !== eventAt) {
          const localEntry = await getLocalEntry(entryId)
          if (localEntry !== null) {
            await updateEntry(entryId, creatorId, {
              body: localEntry.body,
              eventAt: nextEventAt,
              language: localEntry.language,
              title: localEntry.title,
              type: localEntry.type,
              visibility: localEntry.visibility,
            })
          }
        }

        await moveJourneyMomentToStage({
          creatorId,
          entryId,
          journeyId: journey.id,
          stageId: null,
          stopId,
        })
      }

      onChanged()

      if (await canAutomaticallySync()) {
        void syncPendingOperations().catch(() => {
          // The local move remains visible and can be synced again later.
        })
      }
    } catch {
      setFailedEntryId(entryId)
    } finally {
      setBusyEntryId(null)
    }
  }

  return (
    <div className="rounded-[1.25rem] border border-border bg-background/70 p-5">
      <h3 className="text-lg font-semibold">{t('journey.organizeMomentsTitle')}</h3>
      <p className="mt-2 text-sm leading-6 text-muted">
        {t('journey.organizeMomentsDescription')}
      </p>
      <div className="mt-4 space-y-4">
        {content.stageContents.map((stageContent) => {
          if (stageContent.moments.length === 0) {
            return null
          }

          return (
            <div key={getJourneyStageContentKey(stageContent)}>
              <p className="text-sm font-semibold text-muted">
                {getJourneyStageContentLabel(stageContent, t, i18n.language)}
              </p>
              <ul className="mt-2 space-y-3">
                {stageContent.moments.map((moment) => {
                  const title =
                    moment.entry.title?.trim() === ''
                      ? t('dashboard.untitled')
                      : (moment.entry.title ?? t('dashboard.untitled'))
                  const currentValue = getCurrentMomentGroupTarget({
                    eventAt: moment.entry.eventAt,
                    stageId: moment.entry.stageId,
                    validStageIds,
                  })

                  return (
                    <li
                      className="rounded-xl border border-border bg-surface p-4"
                      key={moment.entry.id}
                    >
                      <p className="font-semibold">{title}</p>
                      <label className="mt-3 block text-sm font-medium">
                        {t('journey.organizeMoment')}
                        <select
                          className="mt-2 min-h-11 w-full rounded-md border border-border bg-background px-3 text-base"
                          disabled={busyEntryId === moment.entry.id}
                          onChange={(event) => {
                            void handleMove(
                              moment.entry.id,
                              moment.entry.stopId,
                              moment.entry.eventAt,
                              event.currentTarget.value,
                            )
                          }}
                          value={currentValue}
                        >
                          {moveTargets.map((target) => (
                            <option key={target.value} value={target.value}>
                              {target.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {failedEntryId === moment.entry.id ? (
                        <p className="mt-2 text-sm text-destructive" role="alert">
                          {t('journey.organizeMomentError')}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
