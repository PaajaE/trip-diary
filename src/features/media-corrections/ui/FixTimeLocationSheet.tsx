import { Minus, Plus } from 'lucide-react'
import {
  type ComponentType,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@/entities/media/model/media-library'
import { useMediaCorrections } from '@/features/media-corrections/api/use-media-corrections'
import {
  firstPosition,
  formatCoordinate,
  parseCoordinates,
  type Coordinates,
} from '@/features/media-corrections/model/coordinates'
import {
  HOUR,
  MINUTE,
  shiftableCount,
  shiftPreview,
  SHIFT_PRESETS,
  splitShift,
  stepShift,
  validateShift,
  type ShiftPresetKey,
} from '@/features/media-corrections/model/fix-time'
import type { PickedPoint } from '@/features/media-corrections/ui/LocationPickerMap'
import { cn } from '@/shared/lib/cn'

export type FixTab = 'location' | 'time'

interface FixTimeLocationSheetProps {
  /** Zone for items without a capture zone or position (the moment's zone). */
  fallbackZone?: string | null
  /** The photos to fix, in display order; the first one drives the preview. */
  items: readonly MediaItem[]
  journeyId: string
  onClose: () => void
  /** Called after a successful fix (e.g. to clear the selection). */
  onDone?: () => void
}

interface PickerProps {
  centre: PickedPoint | null
  onFail: () => void
  onPick: (point: PickedPoint) => void
  point: PickedPoint | null
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
const STEP_BUTTON =
  'flex min-h-[52px] min-w-[52px] touch-manipulation items-center justify-center rounded-lg border border-border bg-surface hover:bg-sunk disabled:opacity-40'
const CHIP =
  'min-h-11 touch-manipulation rounded-full border border-border px-3 text-sm font-medium hover:bg-surface'
const PRESET_LABELS: readonly [ShiftPresetKey, string][] = [
  ['hourMinus', 'presetHourMinus'],
  ['hourPlus', 'presetHourPlus'],
  ['halfHourMinus', 'presetHalfMinus'],
  ['halfHourPlus', 'presetHalfPlus'],
  ['dayAhead', 'presetDayAhead'],
  ['dayBehind', 'presetDayBehind'],
]

/**
 * "Fix time and location" bottom sheet (UX-40, UX-41). Rendered above the photo
 * viewer (z-60 vs 50), so while open it owns the keyboard: a capture listener
 * handles Esc, Tab and the tab arrows and keeps keys from the viewer below.
 */
export function FixTimeLocationSheet({
  fallbackZone = null,
  items,
  journeyId,
  onClose,
  onDone,
}: FixTimeLocationSheetProps) {
  const { i18n, t } = useTranslation()
  const corrections = useMediaCorrections(journeyId)
  const ids = useId()
  const titleId = `${ids}-title`
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const [tab, setTab] = useState<FixTab>('time')
  const tabRef = useRef(setTab)
  const [busy, setBusy] = useState(false)
  const [delta, setDelta] = useState(0)
  const [reorganize, setReorganize] = useState(false)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [committed, setCommitted] = useState<Coordinates | null>(null)
  const [mapFailed, setMapFailed] = useState(false)
  const [Picker, setPicker] = useState<ComponentType<PickerProps> | null>(null)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement
    const node = rootRef.current
    node?.focus({ preventScroll: true })
    function onKeyDown(event: KeyboardEvent) {
      if (node === null) return
      // The viewer (or page) below must not see any key while the sheet is up.
      event.stopPropagation()
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current()
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.getAttribute('role') === 'tab' &&
        ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
      ) {
        event.preventDefault()
        const next: FixTab =
          event.key === 'ArrowLeft' || event.key === 'Home'
            ? 'time'
            : 'location'
        tabRef.current(next)
        node
          .querySelector<HTMLElement>(`[data-tab="${next}"]`)
          ?.focus({ preventScroll: true })
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (first === undefined || last === undefined) {
        event.preventDefault()
        return
      }
      const active = document.activeElement
      if (!node.contains(active) || active === node) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  // MapLibre is only fetched when the location tab is first opened.
  useEffect(() => {
    if (tab !== 'location' || Picker !== null || mapFailed) return
    let cancelled = false
    import('@/features/media-corrections/ui/LocationPickerMap').then(
      (module) => {
        if (!cancelled) setPicker(() => module.LocationPickerMap)
      },
      () => {
        if (!cancelled) setMapFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [tab, Picker, mapFailed])

  const count = items.length
  const timed = shiftableCount(items)
  const validity = validateShift(delta)
  const preview = useMemo(
    () => shiftPreview(items, delta, i18n.language, fallbackZone),
    [items, delta, i18n.language, fallbackZone],
  )
  const draft = parseCoordinates(latitude, longitude)
  const centre = useMemo(() => firstPosition(items), [items])
  const parts = splitShift(delta)
  const sign = delta === 0 ? '' : parts.negative ? '−' : '+'
  const shiftText =
    delta === 0
      ? t('mediaCorrections.noShift')
      : `${sign}${String(parts.hours)} h ${String(parts.minutes)} min`

  function add(step: number) {
    setDelta((value) => stepShift(value, step))
  }

  function pick(point: PickedPoint) {
    setLatitude(formatCoordinate(point.latitude))
    setLongitude(formatCoordinate(point.longitude))
    setCommitted(null)
  }

  const canApply =
    !busy &&
    (tab === 'time' ? validity === 'ok' && timed > 0 : committed !== null)
  const applyCount = tab === 'time' ? timed : count

  async function apply() {
    if (!canApply) return
    setBusy(true)
    const ok =
      tab === 'time'
        ? await corrections.shift(items, delta, { reorganize })
        : committed === null
          ? false
          : await corrections.setLocation(
              items,
              committed.latitude,
              committed.longitude,
            )
    setBusy(false)
    if (ok) {
      onDone?.()
      onClose()
    }
  }

  const tabButton = (value: FixTab, label: string) => (
    <button
      aria-controls={tab === value ? `${ids}-panel` : undefined}
      aria-selected={tab === value}
      className={cn(
        'min-h-11 flex-1 touch-manipulation rounded-md px-3 text-sm font-semibold',
        tab === value ? 'bg-background shadow-soft' : 'text-muted',
      )}
      data-tab={value}
      id={`${ids}-tab-${value}`}
      role="tab"
      tabIndex={tab === value ? 0 : -1}
      type="button"
      onClick={() => {
        setTab(value)
      }}
    >
      {label}
    </button>
  )

  const input = (
    id: string,
    label: string,
    value: string,
    set: (next: string) => void,
  ) => (
    <div className="flex-1">
      <label className="block text-sm text-muted" htmlFor={id}>
        {label}
      </label>
      <input
        autoComplete="off"
        className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3"
        id={id}
        inputMode="decimal"
        type="text"
        value={value}
        onChange={(event) => {
          set(event.target.value)
          setCommitted(null)
        }}
      />
    </div>
  )

  const stepper = (
    label: string,
    value: number,
    lessLabel: string,
    moreLabel: string,
    step: number,
  ) => (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <button
          aria-label={lessLabel}
          className={STEP_BUTTON}
          type="button"
          onClick={() => {
            add(-step)
          }}
        >
          <Minus aria-hidden="true" size={20} />
        </button>
        <span
          className="min-w-10 text-center text-xl font-semibold tabular-nums"
          data-testid={`fix-${step === HOUR ? 'hours' : 'minutes'}`}
        >
          {value}
        </span>
        <button
          aria-label={moreLabel}
          className={STEP_BUTTON}
          type="button"
          onClick={() => {
            add(step)
          }}
        >
          <Plus aria-hidden="true" size={20} />
        </button>
      </div>
    </div>
  )

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50"
        data-testid="fix-sheet-backdrop"
        onClick={onClose}
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative flex max-h-[90dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-2xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-foreground shadow-soft outline-none sm:max-w-md"
        ref={rootRef}
        role="dialog"
        tabIndex={-1}
      >
        <div>
          <h2 className="text-lg font-semibold" id={titleId}>
            {t('mediaCorrections.title')}
          </h2>
          <p className="text-sm text-muted">
            {t('mediaCorrections.subtitle', { count })}
          </p>
        </div>
        <div
          aria-label={t('mediaCorrections.tabs')}
          className="flex gap-1 rounded-lg bg-surface p-1"
          role="tablist"
        >
          {tabButton('time', t('mediaCorrections.tabTime'))}
          {tabButton('location', t('mediaCorrections.tabLocation'))}
        </div>

        <div
          aria-labelledby={`${ids}-tab-${tab}`}
          className="flex flex-col gap-3"
          id={`${ids}-panel`}
          role="tabpanel"
        >
          {tab === 'time' ? (
            <>
              {preview === null ? (
                <p className="text-sm text-muted" data-testid="fix-no-time">
                  {t('mediaCorrections.noTime')}
                </p>
              ) : (
                <div
                  className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3"
                  data-testid="fix-preview"
                >
                  <div>
                    <p className="text-xs text-muted">
                      {t('mediaCorrections.now')}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {preview.before.time}
                    </p>
                    <p className="text-xs text-muted">{preview.before.date}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">
                      {t('mediaCorrections.after')}
                    </p>
                    <p
                      className="text-lg font-semibold tabular-nums text-primary"
                      data-testid="fix-after-time"
                    >
                      {preview.after.time}
                    </p>
                    <p className="text-xs text-muted">{preview.after.date}</p>
                  </div>
                </div>
              )}
              {preview !== null && timed < count ? (
                <p className="text-sm text-muted">
                  {t('mediaCorrections.skipped', { count: count - timed })}
                </p>
              ) : null}
              <p aria-live="polite" className="text-sm" role="status">
                {t('mediaCorrections.shift')}
                {': '}
                <strong data-testid="fix-shift">{shiftText}</strong>
              </p>
              <div className="flex gap-3">
                {stepper(
                  t('mediaCorrections.hours'),
                  parts.hours,
                  t('mediaCorrections.hoursLess'),
                  t('mediaCorrections.hoursMore'),
                  HOUR,
                )}
                {stepper(
                  t('mediaCorrections.minutes'),
                  parts.minutes,
                  t('mediaCorrections.minutesLess'),
                  t('mediaCorrections.minutesMore'),
                  MINUTE,
                )}
              </div>
              <div
                aria-label={t('mediaCorrections.presets')}
                className="flex flex-wrap gap-2"
                role="group"
              >
                {PRESET_LABELS.map(([key, label]) => (
                  <button
                    className={CHIP}
                    key={key}
                    type="button"
                    onClick={() => {
                      add(SHIFT_PRESETS[key])
                    }}
                  >
                    {t(`mediaCorrections.${label}`)}
                  </button>
                ))}
                <button
                  className={cn(CHIP, 'text-muted')}
                  disabled={delta === 0}
                  type="button"
                  onClick={() => {
                    setDelta(0)
                  }}
                >
                  {t('mediaCorrections.reset')}
                </button>
              </div>
              {validity === 'tooLarge' ? (
                <p className="text-sm text-destructive" role="alert">
                  {t('mediaCorrections.tooLarge')}
                </p>
              ) : null}
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  checked={reorganize}
                  className="mt-0.5 size-5 shrink-0"
                  type="checkbox"
                  onChange={(event) => {
                    setReorganize(event.target.checked)
                  }}
                />
                {t('mediaCorrections.reorganize')}
              </label>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">
                {t('mediaCorrections.mapHint')}
              </p>
              {mapFailed ? (
                <p className="text-sm text-muted" role="status">
                  {t('mediaCorrections.mapFailed')}
                </p>
              ) : Picker === null ? (
                <p className="text-sm text-muted" role="status">
                  {t('mediaCorrections.mapLoading')}
                </p>
              ) : (
                <Picker
                  centre={centre}
                  point={draft}
                  onFail={() => {
                    setMapFailed(true)
                  }}
                  onPick={pick}
                />
              )}
              <div className="flex gap-2">
                {input(
                  `${ids}-lat`,
                  t('mediaCorrections.latitude'),
                  latitude,
                  setLatitude,
                )}
                {input(
                  `${ids}-lng`,
                  t('mediaCorrections.longitude'),
                  longitude,
                  setLongitude,
                )}
              </div>
              <p
                aria-live="polite"
                className="text-sm"
                data-testid="fix-chosen"
                role="status"
              >
                {draft === null
                  ? t('mediaCorrections.notChosen')
                  : t('mediaCorrections.chosen', {
                      latitude: formatCoordinate(draft.latitude),
                      longitude: formatCoordinate(draft.longitude),
                    })}
              </p>
              {draft === null && (latitude !== '' || longitude !== '') ? (
                <p className="text-sm text-destructive" role="alert">
                  {t('mediaCorrections.invalidCoordinates')}
                </p>
              ) : null}
              <button
                aria-pressed={committed !== null}
                className="min-h-11 touch-manipulation rounded-lg border border-primary px-3 font-semibold text-primary disabled:opacity-40 aria-pressed:bg-primary aria-pressed:text-white"
                disabled={draft === null}
                type="button"
                onClick={() => {
                  setCommitted(draft)
                }}
              >
                {t('mediaCorrections.useLocation')}
              </button>
            </>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            className="min-h-14 touch-manipulation rounded-lg px-4 text-muted hover:bg-surface"
            type="button"
            onClick={onClose}
          >
            {t('common.cancel')}
          </button>
          <button
            className="min-h-14 flex-1 touch-manipulation rounded-lg bg-primary px-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canApply}
            type="button"
            onClick={() => {
              void apply()
            }}
          >
            {busy
              ? t('mediaCorrections.applying')
              : t('mediaCorrections.apply', { count: applyCount })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
