import {
  Check,
  ChevronLeft,
  Cloud,
  Info,
  Play,
  Star,
  Upload,
  Wifi,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TriageItem } from '@/entities/media/model/triage-item'
import {
  estimateBytes,
  filterItems,
  formatBytes,
  groupByDay,
  type TriageCounts,
  type TriageFilter,
} from '@/features/media-import/model/triage'
import {
  formatDayHeading,
  formatTime,
} from '@/features/media-import/model/triage-format'
import { IcloudSwitchRow } from '@/features/media-import/ui/flow/OverviewScreens'
import {
  FlowBody,
  FlowFooter,
  FlowHeader,
  FlowScreen,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  Sheet,
  QuietButton,
  TextButton,
} from '@/features/media-import/ui/flow/flow-ui'
import { Thumb, TriageTile } from '@/features/media-import/ui/flow/Thumbs'
import { itemDayKey, itemZone } from '@/features/media-import/model/triage'
import { cn } from '@/shared/lib/cn'

const TIP_KEY = 'trip-diary:triage-tip-seen'

function readTipSeen(): boolean {
  try {
    return localStorage.getItem(TIP_KEY) === '1'
  } catch {
    return false
  }
}

function FilterBar({
  counts,
  filter,
  onFilter,
}: {
  counts: TriageCounts
  filter: TriageFilter
  onFilter: (next: TriageFilter) => void
}) {
  const { t } = useTranslation()
  const chip = (key: TriageFilter, label: string, icon: React.ReactNode) => (
    <button
      aria-pressed={filter === key}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-[11px] text-[13px] font-semibold whitespace-nowrap',
        filter === key
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-surface text-foreground',
      )}
      key={key}
      onClick={() => {
        onFilter(key)
      }}
      type="button"
    >
      {icon}
      {label}
    </button>
  )
  return (
    <div
      aria-label={t('mediaImport.flow.triage.filterLabel')}
      className="flex flex-none gap-1.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none]"
      role="group"
    >
      {chip(
        'all',
        t('mediaImport.flow.triage.all', { count: counts.total }),
        null,
      )}
      {chip(
        'found',
        t('mediaImport.flow.triage.found', { count: counts.found }),
        <span
          aria-hidden="true"
          className="size-2 rounded-full border-2 border-current"
        />,
      )}
      {chip(
        'kept',
        t('mediaImport.flow.triage.kept', { count: counts.kept }),
        <Check
          aria-hidden="true"
          className={filter === 'kept' ? '' : 'text-primary'}
          size={14}
        />,
      )}
      {chip(
        'starred',
        t('mediaImport.flow.triage.starred', { count: counts.starred }),
        <Star
          aria-hidden="true"
          className={filter === 'starred' ? '' : 'text-warn'}
          size={14}
        />,
      )}
      {chip(
        'dismissed',
        t('mediaImport.flow.triage.dismissed', { count: counts.dismissed }),
        <XCircle
          aria-hidden="true"
          className={filter === 'dismissed' ? '' : 'text-destructive'}
          size={14}
        />,
      )}
    </div>
  )
}

function DaySection({
  actionLabel,
  day,
  heading,
  items,
  locale,
  onAction,
  onOpen,
  restore,
  subtitle,
  timeZone,
}: {
  actionLabel: string | null
  day: string
  heading: string
  items: readonly TriageItem[]
  locale: string
  onAction: () => void
  onOpen: (item: TriageItem) => void
  restore?: boolean
  subtitle: string
  timeZone: string
}) {
  return (
    <section
      className="[contain-intrinsic-size:auto_420px] [content-visibility:auto]"
      data-day={day}
    >
      <div className="sticky top-0 z-[2] flex items-center justify-between gap-2 bg-background pt-2.5 pb-1.5">
        <div>
          <b className="text-[15px] font-semibold">{heading}</b>
          <small className="block text-[13px] text-muted">{subtitle}</small>
        </div>
        {actionLabel === null ? null : (
          <TextButton className="px-1 text-sm" onClick={onAction}>
            {actionLabel}
          </TextButton>
        )}
      </div>
      <div className="grid grid-cols-3 gap-[3px]">
        {items.map((item) => (
          <TriageTile
            item={item}
            key={item.id}
            locale={locale}
            onOpen={() => {
              onOpen(item)
            }}
            {...(restore === true ? { restore } : {})}
            timeZone={timeZone}
          />
        ))}
      </div>
    </section>
  )
}

export function GridScreen({
  counts,
  filter,
  items,
  locale,
  onBack,
  onFilter,
  onKeepRest,
  onOpen,
  onQuick,
  onShowDismissed,
  onUpload,
  timeZone,
}: {
  counts: TriageCounts
  filter: TriageFilter
  items: readonly TriageItem[]
  locale: string
  onBack: () => void
  onFilter: (next: TriageFilter) => void
  onKeepRest: (ids: string[]) => void
  onOpen: (item: TriageItem) => void
  onQuick: () => void
  onShowDismissed: () => void
  onUpload: () => void
  timeZone: string
}) {
  const { t } = useTranslation()
  const [tipSeen, setTipSeen] = useState(readTipSeen)
  const days = useMemo(
    () => groupByDay(filterItems(items, filter), timeZone),
    [items, filter, timeZone],
  )
  const remaining = counts.found
  const bytes = estimateBytes(items.filter((item) => item.status === 'found'))
  const done = counts.total - counts.found
  return (
    <FlowScreen>
      <FlowHeader
        action={
          <TextButton onClick={onQuick}>
            <Play aria-hidden="true" size={18} />
            {t('mediaImport.flow.triage.quick')}
          </TextButton>
        }
        left={
          <IconButton
            label={t('mediaImport.flow.triage.backOverview')}
            onClick={onBack}
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </IconButton>
        }
      >
        {t('mediaImport.flow.triage.title')}
      </FlowHeader>
      <div className="flex-none px-4 pb-2">
        <div
          aria-label={t('mediaImport.flow.triage.progress', {
            done,
            total: counts.total,
          })}
          aria-valuemax={counts.total}
          aria-valuemin={0}
          aria-valuenow={done}
          className="h-2 overflow-hidden rounded-full border border-border bg-sunk"
          role="progressbar"
        >
          <i
            className="block h-full rounded-full bg-primary"
            style={{
              width: `${String(counts.total === 0 ? 0 : Math.round((done / counts.total) * 100))}%`,
            }}
          />
        </div>
      </div>
      <FilterBar
        counts={counts}
        filter={filter}
        onFilter={(next) => {
          if (next === 'dismissed') onShowDismissed()
          else onFilter(next)
        }}
      />
      <FlowBody className="pt-0">
        {tipSeen ? null : (
          <div
            className="mt-0.5 mb-1.5 flex items-center gap-2 rounded-xl bg-primary-soft py-0.5 pr-1 pl-3 text-[13.5px]"
            role="note"
          >
            <Info
              aria-hidden="true"
              className="flex-none text-primary"
              size={20}
            />
            <span className="min-w-0 flex-1">
              {t('mediaImport.flow.triage.tip')}
            </span>
            <button
              className="min-h-11 rounded-xl px-2.5 text-sm font-semibold text-primary"
              onClick={() => {
                try {
                  localStorage.setItem(TIP_KEY, '1')
                } catch {
                  // the tip just shows again next time
                }
                setTipSeen(true)
              }}
              type="button"
            >
              {t('mediaImport.flow.triage.tipOk')}
            </button>
          </div>
        )}
        {days.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {t('mediaImport.flow.triage.empty')}
          </p>
        ) : null}
        {days.map((day) => {
          const place = day.items.find((item) => item.place !== null)?.place
          const heading =
            day.key === 'unknown'
              ? t('mediaImport.flow.triage.unknownDay')
              : [formatDayHeading(day.key, locale), place]
                  .filter((part) => part !== undefined && part !== null)
                  .join(' · ')
          return (
            <DaySection
              actionLabel={
                day.remaining > 0
                  ? t('mediaImport.flow.triage.keepRest', {
                      count: day.remaining,
                    })
                  : null
              }
              day={day.key}
              heading={heading}
              items={day.items}
              key={day.key}
              locale={locale}
              onAction={() => {
                onKeepRest(
                  day.items
                    .filter((item) => item.status === 'found')
                    .map((item) => item.id),
                )
              }}
              onOpen={onOpen}
              subtitle={[
                t('mediaImport.flow.triage.dayMeta', {
                  count: day.items.length,
                  left: day.remaining,
                }),
                day.deviceZoneCount > 0
                  ? t('mediaImport.flow.triage.deviceZone', {
                      count: day.deviceZoneCount,
                    })
                  : null,
              ]
                .filter((part): part is string => part !== null)
                .join(' · ')}
              timeZone={timeZone}
            />
          )
        })}
      </FlowBody>
      <FlowFooter>
        <div className="flex justify-between text-[13px] text-muted">
          <span>
            {t('mediaImport.flow.triage.remainingLabel')}{' '}
            <b className="font-semibold text-foreground tabular-nums">
              {remaining}
            </b>
          </span>
          {remaining > 0 ? <span>≈ {formatBytes(bytes, locale)}</span> : null}
        </div>
        <PrimaryButton disabled={counts.selected === 0} onClick={onUpload}>
          <Upload aria-hidden="true" size={20} />
          {counts.selected === 0
            ? t('mediaImport.flow.triage.uploadNone')
            : t('mediaImport.flow.triage.upload', { count: counts.selected })}
        </PrimaryButton>
      </FlowFooter>
    </FlowScreen>
  )
}

export function DismissedScreen({
  counts,
  current,
  earlier,
  locale,
  onBack,
  onFilter,
  onRestore,
  onUpload,
  timeZone,
}: {
  counts: TriageCounts
  current: readonly TriageItem[]
  earlier: readonly TriageItem[]
  locale: string
  onBack: () => void
  onFilter: (next: TriageFilter) => void
  onRestore: (ids: string[]) => void
  onUpload: () => void
  timeZone: string
}) {
  const { t } = useTranslation()
  const section = (
    title: string,
    meta: string,
    list: readonly TriageItem[],
    key: string,
  ) =>
    list.length === 0 ? null : (
      <section data-section={key} key={key}>
        <div className="sticky top-0 z-[2] flex items-center justify-between gap-2 bg-background pt-2.5 pb-1.5">
          <div>
            <b className="text-[15px] font-semibold">{title}</b>
            <small className="block text-[13px] text-muted">{meta}</small>
          </div>
          <TextButton
            className="px-1 text-sm"
            onClick={() => {
              onRestore(list.map((item) => item.id))
            }}
          >
            {t('mediaImport.flow.dismissed.restoreAll', { count: list.length })}
          </TextButton>
        </div>
        <div className="grid grid-cols-3 gap-[3px]">
          {list.map((item) => (
            <TriageTile
              item={item}
              key={item.id}
              locale={locale}
              onOpen={() => {
                onRestore([item.id])
              }}
              restore
              timeZone={timeZone}
            />
          ))}
        </div>
      </section>
    )
  return (
    <FlowScreen>
      <FlowHeader
        left={
          <IconButton
            label={t('mediaImport.flow.triage.backOverview')}
            onClick={onBack}
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </IconButton>
        }
      >
        {t('mediaImport.flow.dismissed.title')}
      </FlowHeader>
      <FilterBar counts={counts} filter="dismissed" onFilter={onFilter} />
      <FlowBody className="pt-0">
        <p className="px-0.5 pt-0.5 pb-1 text-[13px] text-muted">
          {t('mediaImport.flow.dismissed.lead')}
        </p>
        {current.length === 0 && earlier.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">
            {t('mediaImport.flow.dismissed.empty')}
          </p>
        ) : null}
        {section(
          t('mediaImport.flow.dismissed.thisSelection'),
          t('mediaImport.flow.dismissed.count', { count: current.length }),
          current,
          'current',
        )}
        {section(
          t('mediaImport.flow.dismissed.before'),
          t('mediaImport.flow.dismissed.beforeMeta', { count: earlier.length }),
          earlier,
          'earlier',
        )}
      </FlowBody>
      <FlowFooter>
        <div className="flex justify-between text-[13px] text-muted">
          <span>{t('mediaImport.flow.dismissed.footLeft')}</span>
          <span>{t('mediaImport.flow.dismissed.footRight')}</span>
        </div>
        <PrimaryButton disabled={counts.selected === 0} onClick={onUpload}>
          <Upload aria-hidden="true" size={20} />
          {counts.selected === 0
            ? t('mediaImport.flow.triage.uploadNone')
            : t('mediaImport.flow.triage.upload', { count: counts.selected })}
        </PrimaryButton>
      </FlowFooter>
    </FlowScreen>
  )
}

export function ConfirmRestSheet({
  allBytes,
  allCount,
  icloudCount,
  icloudDownload,
  locale,
  onAll,
  onClose,
  onIcloud,
  onReviewRest,
  onSelected,
  remaining,
  selected,
}: {
  allBytes: number
  allCount: number
  icloudCount: number
  icloudDownload: boolean
  locale: string
  onAll: () => void
  onClose: () => void
  onIcloud: (next: boolean) => void
  onReviewRest: () => void
  onSelected: () => void
  remaining: number
  selected: number
}) {
  const { t } = useTranslation()
  return (
    <Sheet
      onClose={onClose}
      title={
        remaining > 0
          ? t('mediaImport.flow.confirmRest.title', { count: remaining })
          : t('mediaImport.flow.confirmRest.startTitle', { count: selected })
      }
    >
      {remaining > 0 ? (
        <p className="text-[15px]">{t('mediaImport.flow.confirmRest.body')}</p>
      ) : null}
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
          selected
          value={icloudDownload}
        />
      ) : null}
      <PrimaryButton disabled={selected === 0} onClick={onSelected}>
        <Upload aria-hidden="true" size={20} />
        {t('mediaImport.flow.confirmRest.onlySelected', { count: selected })}
      </PrimaryButton>
      {remaining > 0 ? (
        <>
          <SecondaryButton onClick={onReviewRest} small>
            {t('mediaImport.flow.confirmRest.reviewRest')}
          </SecondaryButton>
          <QuietButton onClick={onAll}>
            {t('mediaImport.flow.confirmRest.all', {
              count: allCount,
              size: formatBytes(allBytes, locale),
            })}
          </QuietButton>
        </>
      ) : null}
    </Sheet>
  )
}

export function IcloudSheet({
  item,
  locale,
  onClose,
  onDecide,
  timeZone,
}: {
  item: TriageItem
  locale: string
  onClose: () => void
  onDecide: (decision: 'away' | 'best' | 'keep') => void
  timeZone: string
}) {
  const { t } = useTranslation()
  const when =
    item.capturedAt === null
      ? null
      : `${formatDayHeading(itemDayKey(item, timeZone), locale)} · ${formatTime(
          item.capturedAt,
          locale,
          itemZone(item, timeZone).timeZone,
        )}`
  const meta = [when, item.place]
    .filter((part): part is string => part !== null)
    .join(' · ')
  const action =
    'flex min-h-[66px] flex-col items-center justify-center gap-0.5 rounded-2xl text-[15px] font-bold'
  return (
    <Sheet
      hideTitle
      onClose={onClose}
      title={t('mediaImport.flow.icloud.title')}
    >
      <div className="flex items-start gap-3">
        <div className="relative size-[72px] flex-none overflow-hidden rounded-xl">
          <Thumb item={item} locale={locale} timeZone={timeZone} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xl leading-tight font-semibold">
            {t('mediaImport.flow.icloud.title')}
          </p>
          <small className="block text-sm text-muted">{meta}</small>
        </div>
        <Cloud aria-hidden="true" className="flex-none text-muted" size={26} />
      </div>
      <p className="text-[15px]">{t('mediaImport.flow.icloud.body')}</p>
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2.5">
        <Wifi aria-hidden="true" className="flex-none text-primary" size={20} />
        <div className="min-w-0">
          <b className="block text-sm font-semibold">
            {t('mediaImport.flow.icloud.wifi')}
          </b>
          <small className="block text-[13px] text-muted">
            {t('mediaImport.flow.icloud.wifiNote')}
          </small>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_1.15fr_1fr] gap-2">
        <button
          className={cn(action, 'bg-action-trash text-action-trash-foreground')}
          onClick={() => {
            onDecide('away')
          }}
          type="button"
        >
          <XCircle aria-hidden="true" size={26} />
          {t('mediaImport.flow.quick.away')}
        </button>
        <button
          className={cn(action, 'bg-action-keep text-action-keep-foreground')}
          onClick={() => {
            onDecide('keep')
          }}
          type="button"
        >
          <Check aria-hidden="true" size={26} />
          {t('mediaImport.flow.quick.keep')}
        </button>
        <button
          className={cn(action, 'bg-action-star text-action-star-foreground')}
          onClick={() => {
            onDecide('best')
          }}
          type="button"
        >
          <Star aria-hidden="true" size={26} />
          {t('mediaImport.flow.quick.best')}
        </button>
      </div>
    </Sheet>
  )
}
