import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  formatInstantDate,
  formatInstantTime,
} from '@/features/journey-workspace/lib/format-range'
import type {
  BoundaryCandidate,
  SplitCandidate,
} from '@/features/journey-workspace/model/edit-candidates'
import {
  dialogButton,
  WorkspaceDialog,
} from '@/features/journey-workspace/ui/WorkspaceDialog'

function stamp(iso: string, tz: string | null, locale: string): string {
  return `${formatInstantDate(iso, tz, locale)}, ${formatInstantTime(iso, tz, locale)}`
}

function Actions({
  confirmDisabled,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  confirmDisabled: boolean
  confirmLabel: string
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button className={dialogButton} type="button" onClick={onClose}>
        {t('common.cancel')}
      </button>
      <button
        className={`${dialogButton} bg-primary text-white`}
        disabled={confirmDisabled}
        type="button"
        onClick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  )
}

export function MergeDialog({
  onClose,
  onConfirm,
  sourceLabel,
  targetLabel,
}: {
  onClose: () => void
  onConfirm: () => void
  sourceLabel: string
  targetLabel: string
}) {
  const { t } = useTranslation()
  return (
    <WorkspaceDialog title={t('workspace.mergeTitle')} onClose={onClose}>
      <p className="mt-2 text-sm">
        {t('workspace.mergeBody', {
          source: sourceLabel,
          target: targetLabel,
        })}
      </p>
      <p className="mt-2 text-sm font-medium">{t('workspace.mergeNoUndo')}</p>
      <Actions
        confirmDisabled={false}
        confirmLabel={t('workspace.mergeConfirm')}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    </WorkspaceDialog>
  )
}

interface ChoiceOption {
  id: string
  label: string
}

function ChoiceList({
  legend,
  name,
  onChange,
  options,
  value,
}: {
  legend: string
  name: string
  onChange: (id: string) => void
  options: ChoiceOption[]
  value: string | null
}) {
  return (
    <fieldset className="mt-3 max-h-64 space-y-1 overflow-y-auto">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label
          className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-1.5 text-sm"
          key={option.id}
        >
          <input
            checked={value === option.id}
            name={name}
            type="radio"
            value={option.id}
            onChange={() => {
              onChange(option.id)
            }}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  )
}

export function SplitDialog({
  candidates,
  locale,
  onClose,
  onConfirm,
  tz,
}: {
  candidates: SplitCandidate[]
  locale: string
  onClose: () => void
  onConfirm: (at: string) => void
  tz: string | null
}) {
  const { t } = useTranslation()
  const [at, setAt] = useState<string | null>(null)
  return (
    <WorkspaceDialog title={t('workspace.splitTitle')} onClose={onClose}>
      {candidates.length === 0 ? (
        <p className="mt-2 text-sm">{t('workspace.splitNone')}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">{t('workspace.splitHint')}</p>
          <ChoiceList
            legend={t('workspace.dialogChoice')}
            name="split-at"
            options={candidates.map((c) => ({
              id: c.at,
              label: t('workspace.splitOption', {
                keep: c.keepCount,
                move: c.moveCount,
                time: stamp(c.at, c.firstOfNew.capturedTz ?? tz, locale),
              }),
            }))}
            value={at}
            onChange={setAt}
          />
        </>
      )}
      <Actions
        confirmDisabled={at === null}
        confirmLabel={t('workspace.splitConfirm')}
        onClose={onClose}
        onConfirm={() => {
          if (at !== null) onConfirm(at)
        }}
      />
    </WorkspaceDialog>
  )
}

export function BoundaryDialog({
  afterTitle,
  beforeTitle,
  candidates,
  current,
  locale,
  onClose,
  onConfirm,
}: {
  afterTitle: string
  beforeTitle: string
  candidates: BoundaryCandidate[]
  current: BoundaryCandidate
  locale: string
  onClose: () => void
  onConfirm: (at: string) => void
}) {
  const { t } = useTranslation()
  const [at, setAt] = useState<string | null>(null)
  return (
    <WorkspaceDialog title={t('workspace.boundaryTitle')} onClose={onClose}>
      <p className="mt-2 text-sm text-muted">
        {t('workspace.boundaryHint', {
          after: afterTitle,
          before: beforeTitle,
        })}
      </p>
      <p className="mt-1 text-sm">
        {t('workspace.boundaryCurrent', {
          time: stamp(current.at, current.tz, locale),
        })}
      </p>
      {candidates.length === 0 ? (
        <p className="mt-2 text-sm">{t('workspace.boundaryNone')}</p>
      ) : (
        <ChoiceList
          legend={t('workspace.dialogChoice')}
          name="boundary-at"
          options={candidates.map((c) => ({
            id: c.at,
            label: stamp(c.at, c.tz, locale),
          }))}
          value={at}
          onChange={setAt}
        />
      )}
      <Actions
        confirmDisabled={at === null}
        confirmLabel={t('workspace.boundaryConfirm')}
        onClose={onClose}
        onConfirm={() => {
          if (at !== null) onConfirm(at)
        }}
      />
    </WorkspaceDialog>
  )
}
