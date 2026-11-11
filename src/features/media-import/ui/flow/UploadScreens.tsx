import {
  Check,
  ChevronLeft,
  ChevronRight,
  Images,
  Cloud,
  Info,
  Lock,
  Pause,
  Play,
  RotateCcw,
  TriangleAlert,
  Wifi,
  WifiOff,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { TriageItem } from '@/entities/media/model/triage-item'
import type { UploadJob } from '@/entities/media/model/upload-job'
import type { QueueSnapshot } from '@/features/media-import/api/upload-queue'
import { Thumb } from '@/features/media-import/ui/flow/Thumbs'
import {
  Banner,
  CloseButton,
  FlowBody,
  FlowFooter,
  FlowHeader,
  FlowScreen,
  type FlowStep,
  IconButton,
  Lead,
  PrimaryButton,
  ProgressBar,
  QuietButton,
  SecondaryButton,
  Sheet,
  StatTile,
  Steps,
  TextButton,
  Title,
} from '@/features/media-import/ui/flow/flow-ui'
import { cn } from '@/shared/lib/cn'

function Note({
  children,
  icon,
}: {
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <div className="flex gap-2.5 py-2 text-[13.5px]">
      <span className="mt-0.5 flex-none text-muted">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

/** Small row of finished thumbnails with a check, "+N" at the end. */
export function PhotoStrip({
  items,
  locale,
  timeZone,
  total,
}: {
  items: readonly TriageItem[]
  locale: string
  timeZone: string
  total: number
}) {
  const shown = items.slice(0, 5)
  return (
    <div className="mt-2 flex gap-1.5 overflow-hidden">
      {shown.map((item) => (
        <span
          className="relative size-[54px] flex-none overflow-hidden rounded-[10px]"
          key={item.id}
        >
          <Thumb item={item} locale={locale} timeZone={timeZone} />
          <i className="absolute right-[3px] bottom-[3px] grid size-[18px] place-items-center rounded-full bg-primary text-primary-foreground">
            <Check aria-hidden="true" size={11} strokeWidth={3.5} />
          </i>
        </span>
      ))}
      {total > shown.length ? (
        <span className="grid size-[54px] flex-none place-items-center rounded-[10px] border border-border bg-sunk text-[13px] font-semibold tabular-nums">
          +{total - shown.length}
        </span>
      ) : null}
    </div>
  )
}

function Sec({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3.5 mb-1 text-[13px] font-semibold text-muted">
      {children}
    </div>
  )
}

function jobTitle(
  job: UploadJob,
  t: TFunction,
  locale: string,
  timeZone: string,
): string {
  const name =
    job.capturedAt === null
      ? job.sourceId.slice(0, 8)
      : new Intl.DateTimeFormat(locale, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone,
        }).format(Date.parse(job.capturedAt))
  return t(
    job.mediaType === 'video'
      ? 'mediaImport.flow.upload.video'
      : 'mediaImport.flow.upload.photo',
    { name },
  )
}

function Ring({ percent }: { percent: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 flex-none place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--color-primary) ${String(percent)}%, var(--color-border) 0)`,
      }}
    >
      <span className="grid size-7 place-items-center rounded-full bg-background text-[11px] font-bold">
        {percent}
      </span>
    </span>
  )
}

export type UploadVariant = 'offline' | 'paused' | 'running'

export function UploadScreen({
  etaMinutes,
  itemsBySource,
  locale,
  onCancelRest,
  onContinue,
  onHide,
  onPause,
  onResume,
  onRetry,
  onTriage,
  remainingToTriage,
  snapshot,
  timeZone,
  uploadedItems,
  variant,
  wifiOnly,
  jobs,
}: {
  etaMinutes: number | null
  itemsBySource: ReadonlyMap<string, TriageItem>
  jobs: readonly UploadJob[]
  locale: string
  onCancelRest: () => void
  onContinue: () => void
  onHide: () => void
  onPause: () => void
  onResume: () => void
  onRetry: (job: UploadJob) => void
  onTriage: () => void
  remainingToTriage: number
  snapshot: QueueSnapshot
  timeZone: string
  uploadedItems: readonly TriageItem[]
  variant: UploadVariant
  wifiOnly: boolean
}) {
  const { t } = useTranslation()
  const total = jobs.length
  const done = jobs.filter((job) => job.state === 'done').length
  const failed = jobs.filter((job) => job.state === 'failed')
  const waiting = jobs.filter(
    (job) => job.state === 'pending' || job.state === 'paused',
  )
  const processing = jobs.find((job) => job.state === 'processing')
  const left = total - done
  const fraction = total === 0 ? 0 : done / total
  const current = snapshot.current
  const percent = current === null ? 0 : Math.round(current.fraction * 100)
  const processingItem =
    processing === undefined
      ? undefined
      : itemsBySource.get(processing.sourceId)
  const keepOpen = (
    <Note icon={<Lock aria-hidden="true" size={20} />}>
      {t('mediaImport.flow.upload.keepOpen')}
    </Note>
  )
  const wifiLine = wifiOnly ? (
    <Note icon={<Wifi aria-hidden="true" size={20} />}>
      {variant === 'paused'
        ? t('mediaImport.flow.upload.wifiResume')
        : t('mediaImport.flow.upload.wifi')}
    </Note>
  ) : null
  return (
    <FlowScreen>
      <FlowHeader
        action={
          <TextButton onClick={onHide}>
            {t('mediaImport.flow.upload.hide')}
          </TextButton>
        }
      >
        {t('mediaImport.flow.upload.title')}
      </FlowHeader>
      <Steps current="upload" done={['pick', 'triage']} />
      <FlowBody>
        {variant === 'paused' ? (
          <Banner
            icon={<Pause aria-hidden="true" size={20} />}
            title={t('mediaImport.flow.upload.pausedTitle')}
          >
            <p className="mt-0.5 text-sm">
              {t('mediaImport.flow.upload.pausedBody', { count: left })}
            </p>
          </Banner>
        ) : null}
        {variant === 'offline' ? (
          <Banner
            icon={<WifiOff aria-hidden="true" size={26} />}
            title={t('mediaImport.flow.offline.title')}
            tone="error"
          >
            <p className="mt-0.5 text-sm">
              {t('mediaImport.flow.offline.body')}
            </p>
          </Banner>
        ) : null}
        <div className="text-[44px] leading-none font-bold tracking-[-0.02em] tabular-nums">
          {done}
          <small className="ml-1.5 text-lg font-semibold tracking-normal text-muted">
            {t('mediaImport.flow.upload.of', { total })}
          </small>
        </div>
        <div className="mt-3">
          <ProgressBar
            hold={variant !== 'running'}
            label={t('mediaImport.flow.upload.progress')}
            max={100}
            value={Math.round(fraction * 100)}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[13px] text-muted">
          {variant === 'offline' ? (
            <>
              <span>{t('mediaImport.flow.offline.waiting')}</span>
              <span>{t('mediaImport.flow.offline.left', { count: left })}</span>
            </>
          ) : variant === 'paused' ? (
            <>
              <span>
                {t('mediaImport.flow.upload.remainingItems', { count: left })}
              </span>
              <span>{t('mediaImport.flow.upload.etaAfterResume')}</span>
            </>
          ) : (
            <>
              <span>
                {etaMinutes === null
                  ? ''
                  : t('mediaImport.flow.upload.eta', { count: etaMinutes })}
              </span>
              <span>
                {etaMinutes === null
                  ? ''
                  : t('mediaImport.flow.upload.etaHint')}
              </span>
            </>
          )}
        </div>
        {uploadedItems.length > 0 && variant !== 'offline' ? (
          <>
            <Sec>{t('mediaImport.flow.upload.justUploaded')}</Sec>
            <PhotoStrip
              items={uploadedItems}
              locale={locale}
              timeZone={timeZone}
              total={done}
            />
          </>
        ) : null}
        {variant === 'offline' ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3">
            <Check
              aria-hidden="true"
              className="flex-none text-primary"
              size={20}
            />
            <div className="min-w-0">
              <b className="block text-sm font-semibold">
                {t('mediaImport.flow.offline.triageTitle')}
              </b>
              <small className="block text-[13px] text-muted">
                {t('mediaImport.flow.offline.triageBody')}
              </small>
            </div>
          </div>
        ) : null}
        {variant === 'running' &&
        (processing !== undefined ||
          failed.length > 0 ||
          waiting.length > 0) ? (
          <>
            <Sec>{t('mediaImport.flow.upload.queue')}</Sec>
            <div className="mt-1.5">
              {processing === undefined ? null : (
                <div className="flex items-center gap-3 border-t border-border py-2 first:border-t-0">
                  <span className="relative size-11 flex-none overflow-hidden rounded-[10px]">
                    {processingItem === undefined ? null : (
                      <Thumb
                        item={processingItem}
                        locale={locale}
                        timeZone={timeZone}
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-semibold">
                      {jobTitle(processing, t, locale, timeZone)}
                    </b>
                    <small className="block text-[13px] text-muted">
                      {processingItem?.icloudOnly === true
                        ? t('mediaImport.flow.upload.downloading')
                        : t(
                            `mediaImport.phase.${current?.phase ?? 'preparing'}`,
                          )}
                    </small>
                  </div>
                  <Ring percent={percent} />
                </div>
              )}
              {failed.map((job) => {
                const item = itemsBySource.get(job.sourceId)
                return (
                  <div
                    className="flex items-center gap-3 border-t border-border py-2"
                    key={job.id}
                  >
                    <span className="relative size-11 flex-none overflow-hidden rounded-[10px]">
                      {item === undefined ? null : (
                        <Thumb
                          item={item}
                          locale={locale}
                          timeZone={timeZone}
                        />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-sm font-semibold">
                        {jobTitle(job, t, locale, timeZone)}
                      </b>
                      <small className="block text-[13px] text-destructive">
                        {t(`mediaImport.reason.${job.lastError ?? 'other'}`, {
                          defaultValue: t('mediaImport.reason.other'),
                        })}
                      </small>
                    </div>
                    <button
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
                      onClick={() => {
                        onRetry(job)
                      }}
                      type="button"
                    >
                      <RotateCcw aria-hidden="true" size={14} />
                      {t('mediaImport.flow.upload.retry')}
                    </button>
                  </div>
                )
              })}
              {waiting.length > 0 ? (
                <div className="flex items-center gap-3 border-t border-border py-2">
                  <span className="grid size-11 flex-none place-items-center rounded-[10px] bg-sunk text-[13px] font-bold tabular-nums">
                    +{waiting.length}
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block text-sm font-semibold">
                      {t('mediaImport.flow.upload.waitingMore', {
                        count: waiting.length,
                      })}
                    </b>
                    <small className="block text-[13px] text-muted">
                      {t('mediaImport.flow.upload.waitingMoreHint')}
                    </small>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        <div className="mt-2">
          {variant === 'offline' ? null : wifiLine}
          {keepOpen}
        </div>
      </FlowBody>
      <FlowFooter>
        {variant === 'paused' ? (
          <>
            <PrimaryButton onClick={onResume}>
              <Play aria-hidden="true" size={20} />
              {t('mediaImport.flow.upload.resume')}
            </PrimaryButton>
            <QuietButton danger onClick={onCancelRest}>
              {t('mediaImport.flow.upload.cancelRest')}
            </QuietButton>
            <p className="text-center text-[13px] text-muted">
              {t('mediaImport.flow.upload.cancelRestHint')}
            </p>
          </>
        ) : variant === 'offline' ? (
          <>
            <PrimaryButton onClick={onTriage}>
              {t('mediaImport.flow.offline.triageMore', {
                count: remainingToTriage,
              })}
            </PrimaryButton>
            <SecondaryButton onClick={onPause} small>
              <Pause aria-hidden="true" size={18} />
              {t('mediaImport.flow.upload.pause')}
            </SecondaryButton>
          </>
        ) : snapshot.runtime === 'idle' && waiting.length > 0 ? (
          <PrimaryButton onClick={onContinue}>
            <Play aria-hidden="true" size={20} />
            {t('mediaImport.flow.upload.resume')}
          </PrimaryButton>
        ) : (
          <SecondaryButton onClick={onPause}>
            <Pause aria-hidden="true" size={20} />
            {t('mediaImport.flow.upload.pause')}
          </SecondaryButton>
        )}
      </FlowFooter>
    </FlowScreen>
  )
}

export function DoneScreen({
  days,
  dismissed,
  failed,
  left,
  locale,
  mosaic,
  onClose,
  onContinueTriage,
  onRetry,
  onSort,
  onPhone,
  timeZone,
  uploaded,
}: {
  days: number
  dismissed: number
  failed: number
  left: number
  locale: string
  mosaic: readonly TriageItem[]
  onClose: () => void
  onContinueTriage: () => void
  onPhone: number
  onRetry: () => void
  onSort: () => void
  timeZone: string
  uploaded: number
}) {
  const { t } = useTranslation()
  const cells = mosaic.slice(0, 6)
  return (
    <FlowScreen>
      <FlowHeader left={<CloseButton onClick={onClose} />}>
        {t('mediaImport.flow.upload.title')}
      </FlowHeader>
      <Steps current={null} done={['pick', 'triage', 'upload']} />
      <FlowBody center>
        <div className="mx-auto mb-2 grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
          <Check aria-hidden="true" size={26} />
        </div>
        <Title>{t('mediaImport.flow.done.title', { count: uploaded })}</Title>
        {days > 0 ? (
          <Lead>{t('mediaImport.flow.done.lead', { days })}</Lead>
        ) : null}
        {cells.length >= 6 ? (
          <div className="mt-3 grid h-[159px] grid-cols-3 grid-rows-2 gap-[3px] overflow-hidden rounded-2xl text-left">
            {cells.map((item, index) => (
              <span
                className={cn(
                  'relative overflow-hidden',
                  index === 0 && 'col-span-2 row-span-2',
                )}
                key={item.id}
              >
                <Thumb item={item} locale={locale} timeZone={timeZone} />
              </span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-3 gap-2 text-left">
          <StatTile
            label={t('mediaImport.flow.done.uploaded')}
            value={uploaded}
          />
          <StatTile label={t('mediaImport.flow.done.failed')} value={failed} />
          <StatTile
            label={t('mediaImport.flow.done.onPhone')}
            value={onPhone}
          />
        </div>
        {failed > 0 ? (
          <p className="mt-2.5 text-left text-sm text-destructive" role="alert">
            {t('mediaImport.flow.upload.failed', { count: failed })} ·{' '}
            <button
              className="font-semibold underline underline-offset-[3px]"
              onClick={onRetry}
              type="button"
            >
              {t('mediaImport.flow.done.retryFailed')}
            </button>
          </p>
        ) : null}
        <p className="mt-2.5 text-left text-[13px] text-muted">
          {t('mediaImport.flow.done.note', { dismissed, left })}
        </p>
        {left > 0 ? (
          <button
            className="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 text-left"
            onClick={onContinueTriage}
            type="button"
          >
            <span className="min-w-0 flex-1">
              <b className="block text-[15px] font-semibold">
                {t('mediaImport.flow.done.continueTriage')}
              </b>
              <small className="block text-[13px] text-muted">
                {t('mediaImport.flow.done.continueMeta', { count: left })}
              </small>
            </span>
            <ChevronRight aria-hidden="true" className="text-muted" size={20} />
          </button>
        ) : null}
      </FlowBody>
      <FlowFooter>
        <PrimaryButton onClick={onSort}>
          {t('mediaImport.flow.done.sort')}
          <ChevronRight aria-hidden="true" size={20} />
        </PrimaryButton>
        <QuietButton onClick={onClose}>
          {t('mediaImport.flow.done.backToJourney')}
        </QuietButton>
      </FlowFooter>
    </FlowScreen>
  )
}

export function IcloudWaitingScreen({
  done,
  locale,
  onClose,
  onGo,
  total,
  uploadedItems,
  timeZone,
  waiting,
  wifiOnly,
}: {
  done: number
  locale: string
  onClose: () => void
  onGo: () => void
  timeZone: string
  total: number
  uploadedItems: readonly TriageItem[]
  waiting: number
  wifiOnly: boolean
}) {
  const { t } = useTranslation()
  return (
    <FlowScreen>
      <FlowHeader left={<CloseButton onClick={onClose} />}>
        {t('mediaImport.flow.upload.title')}
      </FlowHeader>
      <Steps current="upload" done={['pick', 'triage']} />
      <FlowBody>
        <Banner
          icon={<Cloud aria-hidden="true" size={26} />}
          title={t('mediaImport.flow.icloudWaiting.title', { count: waiting })}
        >
          <p className="mt-0.5 text-sm">
            {t('mediaImport.flow.icloudWaiting.body')}
          </p>
        </Banner>
        <div className="text-[44px] leading-none font-bold tracking-[-0.02em] tabular-nums">
          {done}
          <small className="ml-1.5 text-lg font-semibold tracking-normal text-muted">
            {t('mediaImport.flow.upload.of', { total: done })}
          </small>
        </div>
        <div className="mt-3">
          <ProgressBar
            label={t('mediaImport.flow.upload.progress')}
            max={100}
            value={100}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[13px] text-muted">
          <span>
            {t('mediaImport.flow.icloudWaiting.waitingLine')}{' '}
            <b className="font-semibold text-foreground tabular-nums">
              {waiting}
            </b>
          </span>
          <span>
            {t('mediaImport.flow.icloudWaiting.totalLine', { count: total })}
          </span>
        </div>
        {uploadedItems.length > 0 ? (
          <>
            <Sec>{t('mediaImport.flow.upload.justUploaded')}</Sec>
            <PhotoStrip
              items={uploadedItems}
              locale={locale}
              timeZone={timeZone}
              total={done}
            />
          </>
        ) : null}
        {wifiOnly ? (
          <div className="mt-2">
            <Note icon={<Wifi aria-hidden="true" size={20} />}>
              {t('mediaImport.flow.icloudWaiting.wifi')}
            </Note>
          </div>
        ) : null}
      </FlowBody>
      <FlowFooter>
        <PrimaryButton onClick={onGo}>
          <Cloud aria-hidden="true" size={20} />
          {t('mediaImport.flow.icloudWaiting.go', { count: waiting })}
        </PrimaryButton>
        <QuietButton onClick={onClose}>
          {t('mediaImport.flow.done.backToJourney')}
        </QuietButton>
      </FlowFooter>
    </FlowScreen>
  )
}

export function ResumeScreen({
  daysLabel,
  discarding,
  found,
  hasUploadWork,
  locale,
  onCloseSheet,
  onContinueTriage,
  onContinueUpload,
  onDiscard,
  onDiscardConfirm,
  onClose,
  selected,
  timeZone,
  triaged,
  uploaded,
  uploadedItems,
  left,
}: {
  daysLabel: string
  discarding: boolean
  found: number
  hasUploadWork: boolean
  left: number
  locale: string
  onClose: () => void
  onCloseSheet: () => void
  onContinueTriage: () => void
  onContinueUpload: () => void
  onDiscard: () => void
  onDiscardConfirm: () => void
  selected: number
  timeZone: string
  triaged: number
  uploaded: number
  uploadedItems: readonly TriageItem[]
}) {
  const { t } = useTranslation()
  const row = (title: string, meta: string, value: number) => (
    <div className="flex items-center gap-3 border-t border-border py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <b className="block text-sm font-semibold">{title}</b>
        <small className="block text-[13px] text-muted">{meta}</small>
      </div>
      <b className="text-lg font-semibold tabular-nums">{value}</b>
    </div>
  )
  return (
    <FlowScreen inert={discarding}>
      <FlowHeader left={<CloseButton onClick={onClose} />}>
        {t('mediaImport.flow.resume.title')}
      </FlowHeader>
      <FlowBody>
        <Banner
          icon={<Info aria-hidden="true" size={26} />}
          title={t('mediaImport.flow.resume.bannerTitle')}
          tone="info"
        >
          <p className="mt-0.5 text-sm">
            {t('mediaImport.flow.resume.bannerBody')}
          </p>
        </Banner>
        <div className="rounded-2xl border border-border bg-surface px-3.5 py-1">
          {row(t('mediaImport.flow.resume.found'), daysLabel, found)}
          {row(
            t('mediaImport.flow.resume.triaged'),
            t('mediaImport.flow.resume.triagedMeta', { count: left }),
            triaged,
          )}
          {row(
            t('mediaImport.flow.resume.uploaded'),
            t('mediaImport.flow.resume.uploadedMeta', {
              left: Math.max(0, selected - uploaded),
              total: selected,
            }),
            uploaded,
          )}
        </div>
        <div className="mt-3.5">
          <ProgressBar
            label={t('mediaImport.flow.resume.uploadAria', {
              done: uploaded,
              total: selected,
            })}
            max={Math.max(selected, 1)}
            value={uploaded}
          />
        </div>
        {uploadedItems.length > 0 ? (
          <PhotoStrip
            items={uploadedItems}
            locale={locale}
            timeZone={timeZone}
            total={uploaded}
          />
        ) : null}
        <Note icon={<Lock aria-hidden="true" size={20} />}>
          {t('mediaImport.flow.upload.keepOpen')}
        </Note>
      </FlowBody>
      <FlowFooter>
        {hasUploadWork ? (
          <PrimaryButton onClick={onContinueUpload}>
            {t('mediaImport.flow.resume.continueUpload')}
          </PrimaryButton>
        ) : null}
        {hasUploadWork ? (
          <SecondaryButton onClick={onContinueTriage} small>
            {t('mediaImport.flow.resume.continueTriage')}
          </SecondaryButton>
        ) : (
          <PrimaryButton onClick={onContinueTriage}>
            {t('mediaImport.flow.resume.continueTriage')}
          </PrimaryButton>
        )}
        <QuietButton danger onClick={onDiscard}>
          {t('mediaImport.flow.resume.discard')}
        </QuietButton>
      </FlowFooter>
      {discarding ? (
        <Sheet
          onClose={onCloseSheet}
          title={t('mediaImport.flow.resume.discardTitle')}
        >
          <p className="text-[15px]">
            {t('mediaImport.flow.resume.discardBody')}
          </p>
          <PrimaryButton onClick={onDiscardConfirm}>
            {t('mediaImport.flow.resume.discardConfirm')}
          </PrimaryButton>
          <SecondaryButton onClick={onCloseSheet} small>
            {t('mediaImport.flow.resume.keep')}
          </SecondaryButton>
        </Sheet>
      ) : null}
    </FlowScreen>
  )
}

/** Empty and error states: icon, title, text and the screen's actions. */
export function MessageScreen({
  actions,
  body,
  done,
  headerTitle,
  icon,
  onBack,
  step,
  title,
}: {
  actions: React.ReactNode
  body: string
  done: readonly FlowStep[]
  headerTitle: string
  icon: 'library' | 'warning'
  onBack: () => void
  step: FlowStep
  title: string
}) {
  const { t } = useTranslation()
  return (
    <FlowScreen>
      <FlowHeader
        left={
          <IconButton label={t('mediaImport.flow.back')} onClick={onBack}>
            <ChevronLeft aria-hidden="true" size={20} />
          </IconButton>
        }
      >
        {headerTitle}
      </FlowHeader>
      <Steps current={step} done={done} />
      <FlowBody center>
        <div
          className={cn(
            'mx-auto mt-9 mb-3 grid size-[72px] place-items-center rounded-full',
            icon === 'library'
              ? 'bg-primary-soft text-primary'
              : 'bg-accent-soft text-accent-strong',
          )}
        >
          {icon === 'warning' ? (
            <TriangleAlert aria-hidden="true" size={26} />
          ) : (
            <Images aria-hidden="true" size={26} />
          )}
        </div>
        <Title>{title}</Title>
        <Lead className="mx-auto max-w-[330px]">{body}</Lead>
      </FlowBody>
      <FlowFooter>{actions}</FlowFooter>
    </FlowScreen>
  )
}
