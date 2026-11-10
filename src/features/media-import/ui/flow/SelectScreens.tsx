import {
  CalendarDays,
  Clock,
  Cloud,
  ExternalLink,
  Images,
  Info,
  Lock,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TriageSource } from '@/features/media-import/api/triage-source'
import { cn } from '@/shared/lib/cn'
import { isoDay } from '@/features/media-import/model/range'
import {
  Banner,
  Chip,
  CloseButton,
  FlowBody,
  FlowFooter,
  FlowHeader,
  FlowScreen,
  IconButton,
  Lead,
  PrimaryButton,
  ProgressBar,
  QuietButton,
  Sheet,
  Steps,
  Title,
} from '@/features/media-import/ui/flow/flow-ui'
import { ChevronLeft } from 'lucide-react'
import type { ReadProgress } from '@/features/media-import/ui/flow/use-import-flow'

/** A stack of three tilted colour cards (the mockup's hero, no photos). */
function Hero() {
  const card =
    'absolute size-[104px] rounded-[14px] border-[3px] border-surface shadow-soft'
  return (
    <div
      aria-hidden="true"
      className="my-1.5 grid h-[150px] place-items-center"
    >
      <div className="relative h-[130px] w-[200px]">
        <span
          className={cn(card, 'top-4 left-1.5 -rotate-[9deg]')}
          style={{ background: 'linear-gradient(170deg,#9fc3e0,#3f6b87)' }}
        />
        <span
          className={cn(card, 'top-2 left-[84px] rotate-[7deg]')}
          style={{ background: 'linear-gradient(170deg,#e0b595,#8a5a3a)' }}
        />
        <span
          className={cn(card, 'top-[22px] left-[46px] -rotate-1')}
          style={{ background: 'linear-gradient(170deg,#a6d4a8,#46704c)' }}
        />
      </div>
    </div>
  )
}

export function SelectScreen({
  access,
  dropHandlers,
  dropping,
  lastImportAt,
  locale,
  onChooseRange,
  onClose,
  onOpenSettings,
  onPick,
  onSince,
  picking,
  pickedLeft,
  source,
}: {
  access: 'authorized' | 'denied' | 'limited' | 'notDetermined' | null
  dropHandlers?: {
    onDragLeave: () => void
    onDragOver: (event: DragEvent<HTMLDivElement>) => void
    onDrop: (event: DragEvent<HTMLDivElement>) => void
  }
  dropping?: boolean
  lastImportAt: string | null
  locale: string
  onChooseRange: () => void
  onClose: () => void
  onOpenSettings?: (() => void) | undefined
  onPick: () => void
  onSince: () => void
  picking: boolean
  pickedLeft: number
  source: Pick<TriageSource, 'hasLibrary'>
}) {
  const { t } = useTranslation()
  const library = source.hasLibrary
  const limited = access === 'limited'
  return (
    <FlowScreen>
      <FlowHeader left={<CloseButton onClick={onClose} />}>
        {t('mediaImport.flow.title')}
      </FlowHeader>
      <Steps current="pick" done={[]} />
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col',
          dropping &&
            'outline-2 -outline-offset-8 outline-primary outline-dashed',
        )}
        data-testid="import-dropzone"
        {...dropHandlers}
      >
        <FlowBody>
          {limited ? (
            <Banner
              icon={<TriangleAlert aria-hidden="true" size={26} />}
              title={t('mediaImport.flow.limited.title')}
            >
              <p className="mt-0.5 text-sm">
                {t('mediaImport.flow.limited.body')}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {onOpenSettings === undefined ? null : (
                  <button
                    className="min-h-11 rounded-xl border border-warn/55 bg-surface px-3 text-sm font-semibold"
                    onClick={onOpenSettings}
                    type="button"
                  >
                    {t('mediaImport.flow.limited.all')}
                  </button>
                )}
              </div>
            </Banner>
          ) : (
            <Hero />
          )}
          <Title>{t('mediaImport.flow.select.title')}</Title>
          <Lead>
            {limited
              ? t('mediaImport.flow.select.leadLimited')
              : library
                ? t('mediaImport.flow.select.lead')
                : t('mediaImport.flow.select.leadWeb')}
          </Lead>
          {pickedLeft > 0 ? (
            <p className="mt-2 text-sm text-muted" role="status">
              {t('mediaImport.flow.limited.pickedLeft', { count: pickedLeft })}
            </p>
          ) : null}
          {library ? (
            <>
              <div className="mt-[18px] mb-2 text-[13px] font-semibold text-muted">
                {t('mediaImport.flow.select.quick')}
              </div>
              <div className="flex flex-wrap gap-2">
                {lastImportAt === null ? null : (
                  <Chip onClick={onSince}>
                    <Clock
                      aria-hidden="true"
                      className="text-primary"
                      size={20}
                    />
                    {t('mediaImport.flow.select.since', {
                      date: new Intl.DateTimeFormat(locale, {
                        day: 'numeric',
                        month: 'numeric',
                      }).format(Date.parse(lastImportAt)),
                    })}
                  </Chip>
                )}
                <Chip onClick={onChooseRange}>
                  <CalendarDays
                    aria-hidden="true"
                    className="text-primary"
                    size={20}
                  />
                  {t('mediaImport.flow.select.range')}
                </Chip>
              </div>
              <p className="mt-2.5 text-[13px] text-muted">
                {t('mediaImport.flow.select.dismissedNote')}
              </p>
              <div className="mt-2 flex gap-2 py-2 text-[13.5px]">
                <Cloud
                  aria-hidden="true"
                  className="mt-0.5 flex-none text-muted"
                  size={20}
                />
                <span>{t('mediaImport.flow.select.icloudInfo')}</span>
              </div>
            </>
          ) : (
            <p className="mt-4 text-[13px] text-muted">
              {t('mediaImport.flow.select.dismissedNote')}
            </p>
          )}
        </FlowBody>
        <FlowFooter>
          <PrimaryButton disabled={picking} onClick={onPick}>
            <Images aria-hidden="true" size={20} />
            {picking
              ? t('mediaImport.flow.select.picking')
              : library
                ? t('mediaImport.flow.select.primary')
                : t('mediaImport.flow.select.primaryWeb')}
          </PrimaryButton>
          <p className="text-center text-[13px] text-muted">
            {library
              ? t('mediaImport.flow.select.primaryHint')
              : t('mediaImport.flow.select.primaryWebHint')}
          </p>
        </FlowFooter>
      </div>
    </FlowScreen>
  )
}

export function DeniedScreen({
  onBack,
  onOpenSettings,
  onRetry,
}: {
  onBack: () => void
  onOpenSettings?: (() => void) | undefined
  onRetry: () => void
}) {
  const { t } = useTranslation()
  return (
    <FlowScreen>
      <FlowHeader left={<CloseButton onClick={onBack} />}>
        {t('mediaImport.flow.title')}
      </FlowHeader>
      <Steps current="pick" done={[]} />
      <FlowBody center>
        <div className="mx-auto mt-[18px] mb-3 grid size-[72px] place-items-center rounded-full bg-warn-soft text-warn">
          <Lock aria-hidden="true" size={26} />
        </div>
        <Title>{t('mediaImport.flow.denied.title')}</Title>
        <Lead className="mx-auto max-w-[330px]">
          {t('mediaImport.flow.denied.lead')}
        </Lead>
        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 text-left">
          <Info
            aria-hidden="true"
            className="flex-none text-primary"
            size={20}
          />
          <small className="text-[13px]">
            {t('mediaImport.flow.denied.note')}
          </small>
        </div>
      </FlowBody>
      <FlowFooter>
        {onOpenSettings === undefined ? null : (
          <PrimaryButton onClick={onOpenSettings}>
            <ExternalLink aria-hidden="true" size={20} />
            {t('mediaImport.flow.denied.openSettings')}
          </PrimaryButton>
        )}
        <QuietButton onClick={onRetry}>
          {t('mediaImport.flow.denied.retry')}
        </QuietButton>
      </FlowFooter>
    </FlowScreen>
  )
}

export function ReadingScreen({
  onCancel,
  progress,
}: {
  onCancel: () => void
  progress: ReadProgress | null
}) {
  const { t } = useTranslation()
  const total = progress?.total ?? null
  const read = progress?.read ?? 0
  return (
    <FlowScreen>
      <FlowHeader
        left={
          <IconButton label={t('mediaImport.flow.back')} onClick={onCancel}>
            <ChevronLeft aria-hidden="true" size={20} />
          </IconButton>
        }
      >
        {t('mediaImport.flow.reading.title')}
      </FlowHeader>
      <Steps current="pick" done={[]} />
      <FlowBody center>
        <div className="mx-auto mt-[18px] mb-3 grid size-[72px] place-items-center rounded-full bg-primary-soft text-primary">
          <Images aria-hidden="true" size={26} />
        </div>
        <div
          className="text-[44px] leading-none font-bold tracking-[-0.02em] tabular-nums"
          data-testid="read-count"
        >
          {read}
          {total === null ? null : (
            <small className="ml-1.5 text-lg font-semibold tracking-normal text-muted">
              {t('mediaImport.flow.reading.of', { total })}
            </small>
          )}
        </div>
        <Lead className="mt-2.5">{t('mediaImport.flow.reading.lead')}</Lead>
        <div className="mx-2 mt-5">
          <ProgressBar
            label={t('mediaImport.flow.reading.progress')}
            max={total ?? Math.max(read, 1)}
            value={total === null ? 0 : read}
          />
        </div>
        <Lead className="mt-3.5">{t('mediaImport.flow.reading.later')}</Lead>
      </FlowBody>
      <FlowFooter>
        <PrimaryButton disabled>
          {t('mediaImport.flow.reading.next')}
        </PrimaryButton>
        <QuietButton onClick={onCancel}>
          {t('mediaImport.flow.reading.cancel')}
        </QuietButton>
      </FlowFooter>
    </FlowScreen>
  )
}

export function RangeSheet({
  count,
  initial,
  onApply,
  onClose,
  onRangeChange,
}: {
  count: { days: number; items: number } | 'counting' | null
  initial: [string, string]
  onApply: () => void
  onClose: () => void
  onRangeChange: (fromDay: string, toDay: string) => void
}) {
  const { t } = useTranslation()
  const [from, setFrom] = useState(initial[0])
  const [to, setTo] = useState(initial[1])
  const invalid = from !== '' && to !== '' && from > to
  function change(nextFrom: string, nextTo: string) {
    setFrom(nextFrom)
    setTo(nextTo)
    if (nextFrom === '' || nextTo === '' || nextFrom <= nextTo) {
      onRangeChange(nextFrom, nextTo)
    }
  }
  useEffect(() => {
    onRangeChange(initial[0], initial[1])
    // The sheet reports its prefilled range once when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function preset(days: number | 'year') {
    const end = new Date()
    const start =
      days === 'year'
        ? new Date(end.getFullYear(), 0, 1)
        : new Date(end.getTime() - days * 86_400_000)
    change(isoDay(start), isoDay(end))
  }
  const field =
    'rounded-xl border border-border bg-background px-3 py-2 min-h-[58px] text-base font-semibold'
  return (
    <Sheet onClose={onClose} title={t('mediaImport.flow.range.title')}>
      <div className="flex flex-wrap gap-2">
        <Chip
          onClick={() => {
            preset(7)
          }}
        >
          {t('mediaImport.flow.range.lastWeek')}
        </Chip>
        <Chip
          onClick={() => {
            preset(30)
          }}
        >
          {t('mediaImport.flow.range.lastMonth')}
        </Chip>
        <Chip
          onClick={() => {
            preset('year')
          }}
        >
          {t('mediaImport.flow.range.thisYear')}
        </Chip>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <label className={field}>
          <small className="block text-xs font-normal text-muted">
            {t('mediaImport.flow.range.from')}
          </small>
          <input
            className="w-full bg-transparent outline-none"
            onChange={(event) => {
              change(event.target.value, to)
            }}
            type="date"
            value={from}
          />
        </label>
        <label className={field}>
          <small className="block text-xs font-normal text-muted">
            {t('mediaImport.flow.range.to')}
          </small>
          <input
            className="w-full bg-transparent outline-none"
            onChange={(event) => {
              change(from, event.target.value)
            }}
            type="date"
            value={to}
          />
        </label>
      </div>
      {invalid ? (
        <p className="text-sm text-destructive" role="alert">
          {t('mediaImport.flow.range.invalid')}
        </p>
      ) : (
        <div
          className="flex items-center gap-2.5 rounded-xl bg-primary-soft p-3 text-[15px]"
          role="status"
        >
          <Images aria-hidden="true" className="text-primary" size={20} />
          <span>
            {count === 'counting' || count === null
              ? t('mediaImport.flow.range.counting')
              : t('mediaImport.flow.range.found', {
                  count: count.items,
                  days: count.days,
                })}
          </span>
        </div>
      )}
      <PrimaryButton disabled={invalid} onClick={onApply}>
        {t('mediaImport.flow.range.apply')}
      </PrimaryButton>
    </Sheet>
  )
}
