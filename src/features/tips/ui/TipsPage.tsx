import { Lightbulb, MapPinOff } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTipsQuery } from '@/entities/tip/api/use-tips-query'
import type { Tip } from '@/entities/tip/model/tip'
import { useSession } from '@/features/auth/session/use-session'
import {
  dialogButton,
  WorkspaceDialog,
} from '@/features/journey-workspace/ui/WorkspaceDialog'
import { useActiveSpace } from '@/features/spaces'
import { useTipActions } from '@/features/tips/api/use-tip-actions'
import { TipDialog } from '@/features/tips/ui/TipDialog'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageContainer, PageHeader } from '@/shared/ui/PageLayout'

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; tip: Tip }
  | { kind: 'delete'; tip: Tip }

export function TipsPage() {
  const { user } = useSession()
  if (user === null) return null
  return <TipsView userId={user.id} />
}

function TipsView({ userId }: { userId: string }) {
  const { i18n, t } = useTranslation()
  const { activeSpace, isError, isPending, refetch } = useActiveSpace(userId)
  const spaceId = activeSpace?.id
  const tips = useTipsQuery(spaceId, userId)
  const actions = useTipActions(spaceId ?? '', userId)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' })
  const close = () => {
    setDialog({ kind: 'closed' })
  }
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  })

  let body: React.ReactNode
  if (isPending || (spaceId !== undefined && tips.isPending)) {
    body = (
      <p className="text-muted" role="status">
        {t('common.loading')}
      </p>
    )
  } else if (isError || tips.isError) {
    body = (
      <div role="alert">
        <p>{t('tips.loadError')}</p>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => {
            void refetch()
            void tips.refetch()
          }}
        >
          {t('common.tryAgain')}
        </Button>
      </div>
    )
  } else if (activeSpace === null) {
    body = (
      <EmptyState
        description={t('tips.noSpaceDescription')}
        icon={MapPinOff}
        title={t('tips.noSpaceTitle')}
      />
    )
  } else if (tips.data?.length === 0) {
    body = (
      <EmptyState
        action={
          <Button
            onClick={() => {
              setDialog({ kind: 'create' })
            }}
          >
            {t('tips.new')}
          </Button>
        }
        description={t('tips.emptyDescription')}
        icon={Lightbulb}
        title={t('tips.emptyTitle')}
      />
    )
  } else {
    body = (
      <ul className="space-y-4">
        {tips.data?.map((tip) => (
          <li
            className="rounded-lg border border-border/70 bg-surface p-5 shadow-soft"
            key={tip.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <h2 className="min-w-0 break-words text-lg font-semibold">
                {tip.title}
              </h2>
              <span
                className={
                  tip.visibility === 'public'
                    ? 'rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary'
                    : 'rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted'
                }
                data-visibility={tip.visibility}
              >
                {tip.visibility === 'public'
                  ? t('tips.visibilityPublic')
                  : t('tips.visibilityPrivate')}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {t('tips.updatedOn', {
                date: dateFormat.format(Date.parse(tip.updatedAt)),
              })}
            </p>
            {tip.body === '' ? null : (
              <p className="mt-3 line-clamp-4 whitespace-pre-line break-words text-sm leading-6">
                {tip.body}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                aria-label={t('tips.editFor', { name: tip.title })}
                variant="secondary"
                onClick={() => {
                  setDialog({ kind: 'edit', tip })
                }}
              >
                {t('tips.edit')}
              </Button>
              <Button
                aria-label={t('tips.deleteFor', { name: tip.title })}
                variant="destructive"
                onClick={() => {
                  setDialog({ kind: 'delete', tip })
                }}
              >
                {t('tips.delete')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    )
  }

  const canCreate = activeSpace !== null && (tips.data?.length ?? 0) > 0

  return (
    <PageContainer>
      <PageHeader
        actions={
          canCreate ? (
            <Button
              onClick={() => {
                setDialog({ kind: 'create' })
              }}
            >
              {t('tips.new')}
            </Button>
          ) : undefined
        }
        description={t('tips.subtitle')}
        title={t('terms.tip.plural')}
      />
      {body}

      {dialog.kind === 'create' ? (
        <TipDialog onClose={close} onSave={actions.create} />
      ) : null}
      {dialog.kind === 'edit' ? (
        <TipDialog
          tip={dialog.tip}
          onClose={close}
          onSave={(input) => actions.update(dialog.tip, input)}
        />
      ) : null}
      {dialog.kind === 'delete' ? (
        <DeleteTipDialog
          tip={dialog.tip}
          onClose={close}
          onConfirm={() => actions.remove(dialog.tip)}
        />
      ) : null}
    </PageContainer>
  )
}

function DeleteTipDialog({
  onClose,
  onConfirm,
  tip,
}: {
  onClose: () => void
  onConfirm: () => Promise<boolean>
  tip: Tip
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  return (
    <WorkspaceDialog title={t('tips.deleteTitle')} onClose={onClose}>
      <p className="mt-3 text-sm">
        {t('tips.deletePrompt', { name: tip.title })}
      </p>
      <p className="mt-1 text-sm text-muted">{t('tips.deleteWarning')}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className={dialogButton} type="button" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          className={`${dialogButton} text-destructive`}
          disabled={busy}
          type="button"
          onClick={() => {
            setBusy(true)
            void onConfirm()
              .then((ok) => {
                if (ok) onClose()
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          {t('tips.delete')}
        </button>
      </div>
    </WorkspaceDialog>
  )
}
