import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { listJourneyChecklistItems } from '@/entities/checklist/api/checklist-mutation.repository'
import type { JourneyChecklistItem } from '@/entities/checklist/model/checklist'
import { listJourneyObservations } from '@/entities/nature/api/observation.repository'
import { observationsForPhoto } from '@/entities/nature/api/observation-mutation.repository'
import { spotNatureGoal } from '@/entities/nature/api/spot-nature-goal.repository'
import type { NatureObservation } from '@/entities/nature/model/observation'
import { rankGoalsForSpotting } from '@/entities/nature/lib/match-observation-to-goal'
import { ExportToINaturalistLink } from '@/features/nature/ui/ExportToINaturalistLink'
import { MinimalObservationSheet } from '@/features/nature/ui/MinimalObservationSheet'
import { PhotoIdentifySuggestions } from '@/features/nature/ui/PhotoIdentifySuggestions'

interface PhotoNatureSpottingProps {
  creatorId: string
  entryId?: string
  journeyId: string
  onChanged?: () => void
  photoId: string
}

export function PhotoNatureSpotting({
  creatorId,
  entryId,
  journeyId,
  onChanged,
  photoId,
}: PhotoNatureSpottingProps) {
  const { t } = useTranslation()
  const [otherOpen, setOtherOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const checklistQuery = useQuery({
    queryFn: () => listJourneyChecklistItems(journeyId),
    queryKey: ['journey-checklist', journeyId],
  })
  const observationsQuery = useQuery({
    queryFn: () => listJourneyObservations(journeyId),
    queryKey: ['journey-observations', journeyId],
  })

  const items = useMemo(
    () => (Array.isArray(checklistQuery.data) ? checklistQuery.data : []),
    [checklistQuery.data],
  )
  const observations = observationsQuery.data ?? []
  const photoObservations = observationsForPhoto(observations, photoId)
  const suggestions = useMemo(
    () => rankGoalsForSpotting(items).slice(0, 5),
    [items],
  )

  if (photoObservations.length > 0) {
    return (
      <div className="flex flex-wrap justify-center gap-2">
        {photoObservations.map((observation) => (
          <ObservationChip key={observation.id} observation={observation} />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <>
        <button
          className="text-sm font-medium text-white/90 underline-offset-4 hover:underline"
          onClick={() => {
            setOtherOpen(true)
          }}
          type="button"
        >
          {t('observation.logPrompt')}
        </button>
        <MinimalObservationSheet
          creatorId={creatorId}
          entryId={entryId ?? null}
          journeyId={journeyId}
          onClose={() => {
            setOtherOpen(false)
          }}
          open={otherOpen}
          photoId={photoId}
          {...(onChanged !== undefined ? { onChanged } : {})}
        />
        <PhotoIdentifySuggestions
          checklistItems={[]}
          creatorId={creatorId}
          {...(entryId !== undefined ? { entryId } : {})}
          journeyId={journeyId}
          {...(onChanged !== undefined ? { onChanged } : {})}
          photoId={photoId}
        />
      </>
    )
  }

  async function handleSpot(item: JourneyChecklistItem) {
    setSaving(true)
    try {
      await spotNatureGoal({
        creatorId,
        ...(entryId !== undefined ? { entryId } : {}),
        item,
        journeyId,
        photoId,
      })
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="flex w-full max-w-xl flex-col items-center gap-2">
        <p className="text-xs text-white/70">{t('nature.match.hint')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((item) => (
            <button
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20 disabled:opacity-50"
              disabled={saving}
              key={item.id}
              onClick={() => {
                void handleSpot(item)
              }}
              type="button"
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full border border-white/60"
              />
              {item.title}
            </button>
          ))}
          <button
            className="rounded-full border border-dashed border-white/30 px-3 py-1.5 text-sm text-white/80 hover:border-white/50 disabled:opacity-50"
            disabled={saving}
            onClick={() => {
              setOtherOpen(true)
            }}
            type="button"
          >
            {t('nature.match.other')}
          </button>
        </div>
        <PhotoIdentifySuggestions
          checklistItems={items}
          creatorId={creatorId}
          {...(entryId !== undefined ? { entryId } : {})}
          journeyId={journeyId}
          {...(onChanged !== undefined ? { onChanged } : {})}
          photoId={photoId}
        />
      </div>
      <MinimalObservationSheet
        creatorId={creatorId}
        entryId={entryId ?? null}
        journeyId={journeyId}
        onClose={() => {
          setOtherOpen(false)
        }}
        open={otherOpen}
        photoId={photoId}
        {...(onChanged !== undefined ? { onChanged } : {})}
      />
    </>
  )
}

function ObservationChip({ observation }: { observation: NatureObservation }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm text-white">
      <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
      {observation.commonName}
      <ExportToINaturalistLink
        className="text-xs text-white/80 hover:text-white"
        commonName={observation.commonName}
        latitude={observation.latitude}
        longitude={observation.longitude}
        scientificName={observation.scientificName}
      />
    </span>
  )
}
