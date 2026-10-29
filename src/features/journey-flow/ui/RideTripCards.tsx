import { Car, ChevronDown, ChevronUp, Footprints, Route } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  RideCard,
  TransitCard,
  TripCard,
} from '@/features/journey-flow/model/stop-review'
import {
  joinFacts,
  timeFactText,
  transitText,
} from '@/features/journey-flow/ui/flow-format'
import { buttonVariants } from '@/shared/ui/button-variants'

/** "Auto, 86 km" / "Pauza 50 min" between two stops. */
export function TransitRow({ card }: { card: TransitCard }) {
  const { i18n, t } = useTranslation()
  const when =
    card.hint.kind === 'move'
      ? timeFactText(t, i18n.language, {
          from: card.hint.from,
          kind: 'range',
          to: card.hint.to,
          tz: null,
        })
      : null
  return (
    <p
      aria-label={t('flow.screen.review.transitLabel')}
      className="flex items-center gap-2 px-2 text-sm text-muted"
    >
      <Route aria-hidden="true" size={14} />
      {joinFacts([transitText(t, card.hint), when])}
    </p>
  )
}

/**
 * "Cestou": the collapsed rides of a stretch. Collapsed by default, expands
 * to the plain facts; "Udělat z ní zastávku" is one tap.
 */
export function RideCardView({
  busy,
  card,
  onPromote,
}: {
  busy: boolean
  card: RideCard
  onPromote: () => void
}) {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const Icon = card.mode === 'vehicle' ? Car : Footprints
  // Only a stretch classified as a vehicle may say "z okna auta".
  const photos =
    card.mode === 'vehicle'
      ? t('flow.review.enRoutePhotos', { count: card.mediaCount })
      : t('flow.review.enRoutePhotosNeutral', { count: card.mediaCount })
  return (
    <section
      aria-label={t('flow.review.enRoute')}
      className="rounded-xl border border-dashed border-border bg-surface p-3"
    >
      <button
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 text-left"
        type="button"
        onClick={() => {
          setOpen((value) => !value)
        }}
      >
        <Icon aria-hidden="true" className="shrink-0 text-muted" size={20} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {t('flow.review.enRoute')}
          </span>
          <span className="block text-sm text-muted">
            {joinFacts([photos, timeFactText(t, i18n.language, card.time)])}
          </span>
        </span>
        {open ? (
          <ChevronUp
            aria-label={t('flow.screen.review.collapse')}
            role="img"
            size={18}
          />
        ) : (
          <ChevronDown
            aria-label={t('flow.screen.review.expand')}
            role="img"
            size={18}
          />
        )}
      </button>
      {open ? (
        <div className="mt-2">
          <button
            className={buttonVariants({ variant: 'secondary' })}
            disabled={busy}
            type="button"
            onClick={onPromote}
          >
            {t('flow.review.promote')}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** A trip inside the day ("Túra k jezeru") with its child cards. */
export function TripCardView({
  card,
  children,
}: {
  card: TripCard
  children: ReactNode
}) {
  const { i18n, t } = useTranslation()
  const mode =
    card.trip.tripType === null
      ? null
      : t(`flow.review.tripMode.${card.trip.tripType}`)
  const facts = joinFacts([
    timeFactText(t, i18n.language, card.time),
    card.distanceKm === null ? null : `${String(card.distanceKm)} km`,
    mode,
  ])
  return (
    <section
      aria-label={t('flow.screen.review.tripLabel', { title: card.trip.title })}
      className="rounded-2xl border border-border bg-sunk/50 p-3"
    >
      <h3 className="text-base font-semibold">{card.trip.title}</h3>
      <p className="text-sm text-muted">{facts}</p>
      <div
        aria-label={t('flow.screen.review.tripStops')}
        className="mt-2 space-y-2 border-l-2 border-border pl-3"
        role="group"
      >
        {children}
      </div>
    </section>
  )
}
