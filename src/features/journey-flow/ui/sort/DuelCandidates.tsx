import { useTranslation } from 'react-i18next'
import {
  candidateStatus,
  type Duel,
} from '@/features/journey-flow/model/compare-duel'
import type {
  PhotoState,
  SessionPhoto,
} from '@/features/journey-flow/model/sort-session'
import { MediaThumb } from '@/features/journey-workspace/ui/MediaThumb'
import { cn } from '@/shared/lib/cn'

/** "Kandidáti": the kept photo first, then every challenger with its state. */
export function DuelCandidates({
  baseUrl,
  duel,
  onPick,
  order,
  photos,
  states,
}: {
  baseUrl: string
  duel: Duel
  onPick: (id: string) => void
  order: readonly string[]
  photos: ReadonlyMap<string, SessionPhoto>
  states: ReadonlyMap<string, PhotoState>
}) {
  const { t } = useTranslation()
  const ids = [duel.winnerId, ...order.filter((id) => id !== duel.winnerId)]
  return (
    <ul
      aria-label={t('flow.duel.candidates')}
      className="no-scrollbar flex items-center gap-1 overflow-x-auto"
    >
      <li aria-hidden="true" className="shrink-0 pr-1 text-xs text-white/70">
        {t('flow.duel.candidates')}
      </li>
      {ids.map((id, index) => {
        const photo = photos.get(id)
        if (photo === undefined) return null
        const status = candidateStatus(id, duel, states)
        return (
          <li className="shrink-0" key={id}>
            <button
              aria-current={status === 'current' ? 'true' : undefined}
              aria-label={t(`flow.duel.candidate.${status}`, { n: index })}
              className={cn(
                'relative flex size-11 items-center justify-center rounded-md',
                (status === 'current' || status === 'winner') &&
                  'outline outline-2 outline-white',
                status === 'trash' && 'opacity-40',
              )}
              type="button"
              onClick={() => {
                onPick(id)
              }}
            >
              <MediaThumb
                baseUrl={baseUrl}
                className="size-9"
                item={photo.item}
              />
            </button>
          </li>
        )
      })}
    </ul>
  )
}
