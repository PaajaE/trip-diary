import { useQueryClient } from '@tanstack/react-query'
import { useId, useState, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addComment,
  mapEngagementError,
  type EngagementError,
  type EngagementTarget,
} from '@/entities/public-engagement/api/public-engagement.repository'
import { ensureGuestSession } from '@/features/auth/api/guest-session'
import { useSession } from '@/features/auth/session'
import {
  publicEngagementKeys,
  useMyPendingComments,
  usePublicEngagementTree,
} from '@/features/public-engagement/api/use-public-engagement'
import {
  loadGuestName,
  saveGuestName,
} from '@/features/public-engagement/lib/guest-name'
import { usePublicEngagementScope } from '@/features/public-engagement/lib/scope-context'
import { HeartButton } from '@/features/public-engagement/ui/HeartButton'
import { Button } from '@/shared/ui/Button'

export const COMMENT_MAX = 500
const NAME_MAX = 40

const FIELD =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

/** Heart + comments for one target. Renders nothing outside a journey scope. */
export function TargetEngagement({ target }: { target: EngagementTarget }) {
  const scope = usePublicEngagementScope()
  if (scope === null) return null
  return (
    <section className="space-y-4 border-t border-border pt-6">
      <HeartButton target={target} />
      <Comments target={target} />
    </section>
  )
}

function Comments({ target }: { target: EngagementTarget }) {
  const { i18n, t } = useTranslation()
  const tree = usePublicEngagementTree()
  const pending = useMyPendingComments()
  const approved = (tree.data?.comments ?? []).filter(
    (c) => c.targetId === target.id && c.targetType === target.type,
  )
  const own = (pending.data ?? []).filter(
    (c) => c.target.id === target.id && c.target.type === target.type,
  )
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
  })
  return (
    <div
      className="scroll-mt-[calc(var(--reader-bar-h)+3.5rem)] space-y-4"
      id="comments"
    >
      <h2 className="text-lg font-semibold">
        {t('publicEngagement.comments')}
      </h2>
      {approved.length === 0 && own.length === 0 ? (
        <p className="text-sm text-muted">
          {t('publicEngagement.commentsEmpty')}
        </p>
      ) : (
        <ul className="space-y-3">
          {approved.map((c) => (
            <li className="text-sm" key={c.id}>
              <p className="font-semibold">
                {c.name}{' '}
                <span className="font-normal text-muted">
                  {dateFormat.format(new Date(c.createdAt))}
                </span>
              </p>
              <p className="whitespace-pre-line">{c.body}</p>
            </li>
          ))}
          {own.map((c) => (
            <li className="text-sm opacity-80" key={c.id}>
              <p className="font-semibold">
                {c.guestName ?? t('publicEngagement.yourComment')}{' '}
                <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal">
                  {t('publicEngagement.pendingLabel')}
                </span>
              </p>
              <p className="whitespace-pre-line">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <CommentForm target={target} />
    </div>
  )
}

function CommentForm({ target }: { target: EngagementTarget }) {
  const { t } = useTranslation()
  const { user } = useSession()
  const scope = usePublicEngagementScope()
  const queryClient = useQueryClient()
  const bodyId = useId()
  const registered = user !== null && user.is_anonymous !== true
  const [name, setName] = useState(loadGuestName)
  const [body, setBody] = useState('')
  const [trap, setTrap] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<EngagementError | null>(null)
  const [notice, setNotice] = useState<'pending' | 'posted' | null>(null)

  const trimmedBody = body.trim()
  const trimmedName = name.trim()
  const valid =
    trimmedBody.length > 0 &&
    trimmedBody.length <= COMMENT_MAX &&
    (registered || (trimmedName.length > 0 && trimmedName.length <= NAME_MAX))

  const onSubmit = async (event: SyntheticEvent) => {
    event.preventDefault()
    if (submitting || !valid) return
    if (trap !== '') {
      // A bot filled the hidden field: pretend success, send nothing.
      setNotice('pending')
      setBody('')
      return
    }
    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      const session = await ensureGuestSession()
      const guest = session.is_anonymous === true
      await addComment({
        body: trimmedBody,
        ...(guest ? { guestName: trimmedName } : {}),
        target,
        userId: session.id,
      })
      if (guest) saveGuestName(trimmedName)
      setBody('')
      setNotice(guest ? 'pending' : 'posted')
      void queryClient.invalidateQueries({
        queryKey: publicEngagementKeys.pending(session.id),
      })
      if (scope !== null) {
        void queryClient.invalidateQueries({
          queryKey: publicEngagementKeys.tree(scope),
        })
      }
    } catch (caught) {
      setError(mapEngagementError(caught))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        void onSubmit(event)
      }}
    >
      {registered ? null : (
        <label className="block space-y-1 text-sm">
          <span>{t('publicEngagement.name')}</span>
          <input
            autoComplete="nickname"
            className={FIELD}
            disabled={submitting}
            maxLength={NAME_MAX}
            onChange={(event) => {
              setName(event.target.value)
            }}
            value={name}
          />
        </label>
      )}
      <div className="space-y-1 text-sm">
        <label htmlFor={bodyId}>{t('publicEngagement.body')}</label>
        <textarea
          aria-describedby={`${bodyId}-hint`}
          className={FIELD}
          id={bodyId}
          disabled={submitting}
          maxLength={COMMENT_MAX}
          onChange={(event) => {
            setBody(event.target.value)
          }}
          rows={3}
          value={body}
        />
        <p className="text-xs text-muted" id={`${bodyId}-hint`}>
          {t('publicEngagement.bodyHint', { max: COMMENT_MAX })}
        </p>
      </div>
      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label>
          Website
          <input
            autoComplete="off"
            name="website"
            onChange={(event) => {
              setTrap(event.target.value)
            }}
            tabIndex={-1}
            value={trap}
          />
        </label>
      </div>
      <Button disabled={submitting || !valid} type="submit">
        {submitting
          ? t('publicEngagement.sending')
          : t('publicEngagement.send')}
      </Button>
      {notice !== null ? (
        <p className="text-sm" role="status">
          {notice === 'pending'
            ? t('publicEngagement.approvalNotice')
            : t('publicEngagement.posted')}
        </p>
      ) : null}
      {error !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {t(`publicEngagement.error.${error.kind}`)}
        </p>
      ) : null}
    </form>
  )
}
