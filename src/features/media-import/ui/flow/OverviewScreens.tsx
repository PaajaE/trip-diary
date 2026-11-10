import { ArrowRight, ChevronLeft, Info, Upload } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TriageItem } from '@/entities/media/model/triage-item'
import {
  estimateBytes,
  estimateMinutes,
  formatBytes,
  formatMinutes,
  summarizeOverview,
} from '@/features/media-import/model/triage'
import {
  formatDayRange,
  formatDayShort,
  projectRoute,
} from '@/features/media-import/model/triage-format'
import {
  Banner,
  FlowBody,
  FlowFooter,
  FlowHeader,
  FlowScreen,
  IconButton,
  Lead,
  LinkButton,
  PrimaryButton,
  SecondaryButton,
  Sheet,
  StatTile,
  Steps,
  Switch,
  Title,
} from '@/features/media-import/ui/flow/flow-ui'

const ROUTE_W = 334
const ROUTE_H = 100

function RouteCard({
  dayCounts,
  firstPlace,
  lastPlace,
  locale,
  route,
}: {
  dayCounts: { count: number; key: string }[]
  firstPlace: string | null
  lastPlace: string | null
  locale: string
  route: { latitude: number; longitude: number }[]
}) {
  const { t } = useTranslation()
  const points = projectRoute(route, ROUTE_W, ROUTE_H, 22)
  const max = Math.max(1, ...dayCounts.map((d) => d.count))
  const dense = dayCounts.length > 14
  const first = dayCounts[0]
  const last = dayCounts.at(-1)
  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface px-3 pt-2.5 pb-3">
      <svg
        aria-label={t('mediaImport.flow.overview.routeLabel')}
        className="block h-auto w-full"
        role="img"
        viewBox={`0 0 ${String(ROUTE_W)} ${String(ROUTE_H)}`}
      >
        <path
          className="fill-primary-soft"
          d="M8 60 C26 32 58 24 92 28 C120 8 168 4 206 16 C238 4 286 10 318 32 C332 52 322 80 296 92 C240 98 150 96 92 94 C50 96 16 86 8 60z"
        />
        {points.length > 1 ? (
          <polyline
            className="fill-none stroke-primary"
            points={points
              .map((p) => `${String(p.x)},${String(p.y)}`)
              .join(' ')}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        ) : null}
        {points.map((p, i) => (
          <circle
            className="fill-primary stroke-surface"
            cx={p.x}
            cy={p.y}
            key={`${String(p.x)}-${String(p.y)}-${String(i)}`}
            r={i === 0 || i === points.length - 1 ? 6 : 4.5}
            strokeWidth="2"
          />
        ))}
        {firstPlace !== null && points[0] !== undefined ? (
          <text
            className="fill-foreground text-xs font-semibold"
            x={Math.min(points[0].x, ROUTE_W - 80)}
            y={Math.min(points[0].y + 20, ROUTE_H - 4)}
          >
            {firstPlace}
          </text>
        ) : null}
        {lastPlace !== null &&
        lastPlace !== firstPlace &&
        points.at(-1) !== undefined ? (
          <text
            className="fill-foreground text-xs font-semibold"
            x={Math.min(points.at(-1)?.x ?? 0, ROUTE_W - 80)}
            y={Math.min((points.at(-1)?.y ?? 0) + 20, ROUTE_H - 4)}
          >
            {lastPlace}
          </text>
        ) : null}
      </svg>
      <div
        aria-label={t('mediaImport.flow.overview.daysLabel')}
        className={
          dense
            ? 'mt-1 flex h-[46px] items-end gap-px'
            : 'mt-1 flex h-[46px] items-end gap-1'
        }
        role="img"
      >
        {dayCounts.map((day) => (
          <i
            className="min-w-0.5 flex-1 rounded-t-[3px] bg-primary"
            key={day.key}
            style={{
              height: `${String(Math.max(4, Math.round((day.count / max) * 46)))}px`,
            }}
          />
        ))}
      </div>
      {first === undefined || last === undefined ? null : dense ? (
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{formatDayShort(first.key, locale)}</span>
          <span>{formatDayShort(last.key, locale)}</span>
        </div>
      ) : (
        <div className="mt-1 flex text-xs text-muted">
          {dayCounts.map((day) => (
            <span className="flex-1 text-center" key={day.key}>
              {String(Number(day.key.slice(8)))}.
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function OverviewScreen({
  dismissedBefore,
  items,
  locale,
  onAll,
  onBack,
  onShowDismissed,
  onTriage,
  skipped,
  timeZone,
}: {
  dismissedBefore: number
  items: readonly TriageItem[]
  locale: string
  onAll: () => void
  onBack: () => void
  onShowDismissed: () => void
  onTriage: () => void
  skipped: number
  timeZone: string
}) {
  const { t } = useTranslation()
  const overview = useMemo(
    () => summarizeOverview(items, timeZone),
    [items, timeZone],
  )
  const large = overview.total > 1000
  const bytes = estimateBytes(items)
  const range =
    overview.firstDay === null || overview.lastDay === null
      ? null
      : formatDayRange(overview.firstDay, overview.lastDay, locale)
  const places =
    overview.places.first !== null &&
    overview.places.last !== null &&
    overview.places.first !== overview.places.last
      ? `${overview.places.first} → ${overview.places.last}`
      : null
  const lead = [
    places,
    range,
    overview.days > 0
      ? t('mediaImport.flow.overview.days', { count: overview.days })
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')
  const number = new Intl.NumberFormat(locale)
  return (
    <FlowScreen>
      <FlowHeader
        action={
          <span className="pr-2.5 text-[13px] whitespace-nowrap text-muted">
            {t('mediaImport.flow.overview.none')}
          </span>
        }
        left={
          <IconButton label={t('mediaImport.flow.back')} onClick={onBack}>
            <ChevronLeft aria-hidden="true" size={20} />
          </IconButton>
        }
      >
        {t('mediaImport.flow.overview.title')}
      </FlowHeader>
      <Steps current="triage" done={['pick']} />
      <FlowBody>
        <Title>{t('mediaImport.flow.overview.heading')}</Title>
        {lead === '' ? null : <Lead>{lead}</Lead>}
        <RouteCard
          dayCounts={overview.dayCounts}
          firstPlace={overview.places.first}
          lastPlace={overview.places.last}
          locale={locale}
          route={overview.route}
        />
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <StatTile
            label={t('mediaImport.flow.overview.photos')}
            value={number.format(overview.photos)}
          />
          <StatTile
            label={t('mediaImport.flow.overview.videos')}
            value={number.format(overview.videos)}
          />
          {overview.icloudOnly > 0 ? (
            <StatTile
              label={t('mediaImport.flow.overview.icloud')}
              value={number.format(overview.icloudOnly)}
            />
          ) : (
            <StatTile
              label={t('mediaImport.flow.overview.daysStat')}
              value={number.format(overview.days)}
            />
          )}
          <StatTile
            label={t('mediaImport.flow.overview.noLocation')}
            value={number.format(overview.noLocation)}
          />
        </div>
        {large ? (
          <div className="mt-3">
            <Banner
              icon={<Info aria-hidden="true" size={20} />}
              title={t('mediaImport.flow.overview.largeTitle')}
              tone="info"
            >
              <p className="mt-0.5 text-sm">
                {t('mediaImport.flow.overview.largeBody', {
                  size: formatBytes(bytes, locale),
                  time: formatMinutes(estimateMinutes(bytes)),
                })}
              </p>
            </Banner>
          </div>
        ) : (
          <p className="mt-2.5 text-[13px] text-muted">
            {t('mediaImport.flow.overview.note')}
          </p>
        )}
        {skipped > 0 ? (
          <p className="mt-0.5 text-[13px] text-muted">
            {t('mediaImport.flow.overview.skipped', { count: skipped })}
          </p>
        ) : null}
        {dismissedBefore > 0 ? (
          <p className="mt-0.5 text-[13px] text-muted">
            {t('mediaImport.flow.overview.previouslyDismissed', {
              count: dismissedBefore,
            })}{' '}
            ·{' '}
            <LinkButton onClick={onShowDismissed}>
              {t('mediaImport.flow.overview.show')}
            </LinkButton>
          </p>
        ) : null}
      </FlowBody>
      <FlowFooter>
        <PrimaryButton onClick={onTriage}>
          {t('mediaImport.flow.overview.triage')}
          <ArrowRight aria-hidden="true" size={20} />
        </PrimaryButton>
        <SecondaryButton onClick={onAll} small>
          {t('mediaImport.flow.overview.uploadAll')}
        </SecondaryButton>
      </FlowFooter>
    </FlowScreen>
  )
}

/** The iCloud row of the confirm sheets: switch + context note. */
export function IcloudSwitchRow({
  count,
  note,
  onChange,
  selected,
  value,
}: {
  count: number
  note: string
  onChange: (next: boolean) => void
  selected?: boolean
  value: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-1.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <b className="block text-sm font-semibold">
            {t(
              selected === true
                ? 'mediaImport.flow.icloudSwitch.selectedRow'
                : 'mediaImport.flow.icloudSwitch.row',
              { count },
            )}
          </b>
          <small className="block text-[13px] leading-snug text-muted">
            {note}
          </small>
        </div>
        <Switch
          checked={value}
          label={t('mediaImport.flow.icloudSwitch.label')}
          onChange={onChange}
        />
      </div>
    </div>
  )
}

export function ConfirmAllSheet({
  count,
  icloudCount,
  icloudDownload,
  items,
  locale,
  onClose,
  onGo,
  onIcloud,
  onReview,
}: {
  count: number
  icloudCount: number
  icloudDownload: boolean
  items: readonly TriageItem[]
  locale: string
  onClose: () => void
  onGo: () => void
  onIcloud: (next: boolean) => void
  onReview: () => void
}) {
  const { t } = useTranslation()
  const bytes = estimateBytes(items)
  const size = formatBytes(bytes, locale)
  return (
    <Sheet
      onClose={onClose}
      title={t('mediaImport.flow.confirmAll.title', { count })}
    >
      <p className="text-[15px]">
        {t('mediaImport.flow.confirmAll.body', {
          size,
          time: formatMinutes(estimateMinutes(bytes)),
        })}
      </p>
      {icloudCount > 0 ? (
        <IcloudSwitchRow
          count={icloudCount}
          note={
            icloudDownload
              ? t('mediaImport.flow.icloudSwitch.onNote')
              : t('mediaImport.flow.icloudSwitch.offNote', {
                  count: icloudCount,
                })
          }
          onChange={onIcloud}
          value={icloudDownload}
        />
      ) : null}
      <PrimaryButton onClick={onGo}>
        <Upload aria-hidden="true" size={20} />
        {t('mediaImport.flow.confirmAll.go', { count, size })}
      </PrimaryButton>
      <SecondaryButton onClick={onReview} small>
        {t('mediaImport.flow.confirmAll.review')}
      </SecondaryButton>
    </Sheet>
  )
}
