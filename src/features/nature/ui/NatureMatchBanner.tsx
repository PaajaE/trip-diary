import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listJourneyChecklistItems } from '@/entities/checklist/api/checklist-mutation.repository'
import { checklistQueryKeys } from '@/entities/checklist/api/checklist-query-keys'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import { spotNatureGoal } from '@/entities/nature/api/spot-nature-goal.repository'
import { rankGoalsForSpotting } from '@/entities/nature/lib/match-observation-to-goal'
import { MinimalObservationSheet } from '@/features/nature/ui/MinimalObservationSheet'
import { PhotoIdentifySuggestions } from '@/features/nature/ui/PhotoIdentifySuggestions'
import { NatureWishChip } from '@/features/nature/ui/NatureWishChip'
import { cn } from '@/shared/lib/cn'

interface NatureMatchBannerProps {
  className?: string
  creatorId: string
  entryId: string
  entryTitle?: string
  journeyId: string
  latitude?: number | null
  longitude?: number | null
  natureGoalId?: string
  onChanged?: () => void
  onDismiss?: () => void
  onSpotted?: () => void
  photoId?: string | null
}

export function NatureMatchBanner({
  className,
  creatorId,
  entryId,
  entryTitle,
  journeyId,
  latitude = null,
  longitude = null,
  natureGoalId,
  onChanged,
  onDismiss,
  onSpotted,
  photoId = null,
}: NatureMatchBannerProps) {
  const { t } = useTranslation()
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null)
  const [otherOpen, setOtherOpen] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const checklistQuery = useQuery({
    queryFn: () => listJourneyChecklistItems(journeyId),
    queryKey: checklistQueryKeys.journey(journeyId),
  })

  const items = useMemo(
    () => (Array.isArray(checklistQuery.data) ? checklistQuery.data : []),
    [checklistQuery.data],
  )
  const suggestions = useMemo(
    () =>
      rankGoalsForSpotting(items, {
        ...(natureGoalId !== undefined ? { goalId: natureGoalId } : {}),
        ...(entryTitle !== undefined ? { title: entryTitle } : {}),
      }).slice(0, 6),
    [entryTitle, items, natureGoalId],
  )

  if (dismissed || items.length === 0) {
    return null
  }

  async function handleSpot(item: JourneyChecklistItem) {
    setSavingGoalId(item.id)
    try {
      await spotNatureGoal({
        creatorId,
        entryId,
        item,
        journeyId,
        latitude,
        longitude,
        photoId,
      })
      onChanged?.()
      onSpotted?.()
      setDismissed(true)
      onDismiss?.()
    } finally {
      setSavingGoalId(null)
    }
  }

  return (
    <>
      <section
        className={cn('rounded-2xl bg-primary/6 px-4 py-4 sm:px-5', className)}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t('nature.match.title')}</p>
            <p className="mt-1 text-sm text-muted">{t('nature.match.hint')}</p>
          </div>
          <button
            className="shrink-0 text-sm text-muted hover:text-foreground"
            onClick={() => {
              setDismissed(true)
              onDismiss?.()
            }}
            type="button"
          >
            {t('nature.match.skip')}
          </button>
        </div>

        {checklistQuery.isPending ? (
          <p className="mt-3 text-sm text-muted" role="status">
            {t('nature.strip.loading')}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map((item) => (
              <NatureWishChip
                checked={false}
                key={item.id}
                label={item.title}
                onSelect={() => {
                  void handleSpot(item)
                }}
              />
            ))}
            <button
              className="inline-flex shrink-0 items-center rounded-full border border-dashed border-border px-3.5 py-2 text-sm text-muted transition hover:border-primary/30 hover:text-foreground disabled:opacity-60"
              disabled={savingGoalId !== null}
              onClick={() => {
                setOtherOpen(true)
              }}
              type="button"
            >
              {t('nature.match.other')}
            </button>
          </div>
        )}
        {photoId !== null && photoId !== '' ? (
          <PhotoIdentifySuggestions
            checklistItems={items}
            className="mt-4"
            creatorId={creatorId}
            tone="default"
            entryId={entryId}
            journeyId={journeyId}
            latitude={latitude}
            longitude={longitude}
            onChanged={() => {
              onChanged?.()
              setDismissed(true)
              onDismiss?.()
            }}
            {...(onSpotted !== undefined ? { onSpotted } : {})}
            photoId={photoId}
          />
        ) : null}
      </section>

      <MinimalObservationSheet
        creatorId={creatorId}
        entryId={entryId}
        journeyId={journeyId}
        latitude={latitude}
        longitude={longitude}
        onChanged={() => {
          onChanged?.()
          setDismissed(true)
          onDismiss?.()
        }}
        onClose={() => {
          setOtherOpen(false)
        }}
        onSaved={() => {
          onSpotted?.()
          setOtherOpen(false)
        }}
        open={otherOpen}
        photoId={photoId}
      />
    </>
  )
}
