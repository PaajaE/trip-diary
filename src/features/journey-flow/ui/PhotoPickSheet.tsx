import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlowStop } from '@/features/journey-flow/model/flow-days'
import {
  splitPreview,
  suggestedSplitId,
} from '@/features/journey-flow/model/stop-review'
import { timeFactText } from '@/features/journey-flow/ui/flow-format'
import {
  dialogButton,
  WorkspaceDialog,
} from '@/features/journey-workspace/ui/WorkspaceDialog'
import { formatLocalTime } from '@/features/journey-workspace/lib/format-range'
import { getThumbUrl } from '@/features/journey-workspace/lib/media-thumb'
import { BASE_URL } from '@/features/journey-workspace/lib/moment-labels'
import { cn } from '@/shared/lib/cn'

type Props =
  | { mode: 'cut'; onConfirm: (at: string) => void }
  | { mode: 'select'; onConfirm: (mediaIds: string[]) => void }

/**
 * Photo picker of a stop. "cut" (M-Rozdelit): tap the photo the new stop
 * starts with, with a preview of both parts. "select": tick the photos to
 * move (then the "Přesunout do" sheet). Touch-sized tiles, no hover needed.
 */
export function PhotoPickSheet({
  onClose,
  stop,
  ...props
}: Props & { onClose: () => void; stop: FlowStop }) {
  const { i18n, t } = useTranslation()
  const locale = i18n.language
  const [cutId, setCutId] = useState<string | null>(() =>
    suggestedSplitId(stop),
  )
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const preview = useMemo(
    () => (cutId === null ? null : splitPreview(stop, cutId)),
    [cutId, stop],
  )
  const cut = props.mode === 'cut'
  const timeOf = (iso: string | null, tz: string | null) =>
    iso === null ? '' : formatLocalTime(iso, tz, locale)

  const confirm = () => {
    if (props.mode === 'cut') {
      if (preview !== null) props.onConfirm(preview.at)
    } else {
      props.onConfirm(
        stop.media.filter((m) => picked.has(m.id)).map((m) => m.id),
      )
    }
  }
  const canConfirm = cut ? preview !== null : picked.size > 0

  return (
    <WorkspaceDialog
      title={cut ? t('flow.split.title') : t('flow.review.movePhotos')}
      wide
      onClose={onClose}
    >
      <p className="mt-2 text-sm text-muted">
        {cut ? t('flow.split.hint') : t('flow.screen.unassigned.moveElsewhere')}
      </p>
      <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {stop.media.map((item) => {
          const url = getThumbUrl(item, BASE_URL)
          const time = timeOf(item.capturedAt, item.capturedTz)
          const on = cut ? item.id === cutId : picked.has(item.id)
          return (
            <li key={item.id}>
              <button
                aria-label={t('flow.screen.splitSheet.photoLabel', { time })}
                aria-pressed={on}
                className={cn(
                  'relative block aspect-square min-h-11 w-full overflow-hidden rounded-lg bg-sunk',
                  on ? 'ring-4 ring-primary' : '',
                )}
                type="button"
                onClick={() => {
                  if (cut) setCutId(item.id)
                  else {
                    setPicked((current) => {
                      const next = new Set(current)
                      if (!next.delete(item.id)) next.add(item.id)
                      return next
                    })
                  }
                }}
              >
                {url === null ? null : (
                  <img alt="" className="size-full object-cover" src={url} />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 text-[11px] text-white">
                  {time}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {cut ? (
        <div
          aria-live="polite"
          className="mt-3 space-y-1 text-sm"
          role="status"
        >
          {preview === null ? (
            <p className="text-muted">
              {t('flow.screen.splitSheet.cannotCut')}
            </p>
          ) : (
            <>
              <p className="font-semibold">
                {t('flow.split.cutHere', {
                  minutes: Math.max(1, Math.round(preview.pauseMs / 60_000)),
                })}
              </p>
              <p>
                {t('flow.screen.splitSheet.before', {
                  time: timeFactText(t, locale, preview.before.time),
                })}
              </p>
              <p>
                {t('flow.screen.splitSheet.after', {
                  time: timeFactText(t, locale, preview.after.time),
                })}
              </p>
              <p className="text-muted">{t('flow.split.locks')}</p>
            </>
          )}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className={dialogButton} type="button" onClick={onClose}>
          {t('flow.split.cancel')}
        </button>
        <button
          className={`${dialogButton} bg-primary text-primary-foreground`}
          disabled={!canConfirm}
          type="button"
          onClick={confirm}
        >
          {cut ? t('flow.split.confirm') : t('flow.review.movePhotos')}
        </button>
      </div>
    </WorkspaceDialog>
  )
}
