import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { PendingComment } from '@/entities/public-engagement/api/public-engagement.repository'
import {
  useJourneyPublicPath,
  useModerateComment,
  usePendingComments,
} from '@/features/journey-workspace/api/use-pending-comments'
import { Button } from '@/shared/ui/Button'

function publicHref(
  path: { journeySlug: string; spaceHandle: string } | null | undefined,
  comment: PendingComment,
): string | null {
  if (path === null || path === undefined) return null
  const base = `/${path.spaceHandle}/${path.journeySlug}`
  switch (comment.target.type) {
    case 'moment':
      return `${base}/m/${comment.target.id}`
    case 'segment':
      return `${base}/e/${comment.target.id}`
    case 'journey':
    case 'media':
      return base
  }
}

/** Owner-only list of guest comments waiting for approval (RLS enforces it). */
export function ModerationPanel({
  journeyId,
  titles,
}: {
  journeyId: string
  titles: Map<string, string>
}) {
  const { t } = useTranslation()
  const pending = usePendingComments(journeyId)
  const path = useJourneyPublicPath(journeyId)
  const moderate = useModerateComment(journeyId)
  const comments = pending.data ?? []
  if (comments.length === 0 && !moderate.isError) return null

  return (
    <section
      aria-labelledby="moderation-heading"
      className="mb-6 space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="text-lg font-semibold" id="moderation-heading">
        {t('moderation.title')}{' '}
        <span className="rounded-full bg-border px-2 py-0.5 text-sm">
          {comments.length}
        </span>
      </h2>
      {moderate.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {t('moderation.error')}
        </p>
      ) : null}
      <ul className="space-y-3">
        {comments.map((comment) => {
          const href = publicHref(path.data, comment)
          const title = titles.get(comment.target.id)
          return (
            <li className="space-y-1 text-sm" key={comment.id}>
              <p className="text-xs text-muted">
                {t(`moderation.target.${comment.target.type}`)}
                {title !== undefined ? `: ${title}` : ''}
                {href !== null ? (
                  <>
                    {' · '}
                    <Link className="underline" to={href}>
                      {t('moderation.open')}
                    </Link>
                  </>
                ) : null}
              </p>
              <p>
                <span className="font-semibold">{comment.guestName}</span>
                {': '}
                <span className="whitespace-pre-line">{comment.body}</span>
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    moderate.mutate({
                      commentId: comment.id,
                      status: 'approved',
                    })
                  }}
                >
                  {t('moderation.approve')}
                </Button>
                <Button
                  onClick={() => {
                    moderate.mutate({
                      commentId: comment.id,
                      status: 'rejected',
                    })
                  }}
                  variant="secondary"
                >
                  {t('moderation.reject')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
