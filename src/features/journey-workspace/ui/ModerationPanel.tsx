import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
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
  const [open, setOpen] = useState(false)
  const comments = pending.data ?? []
  if (comments.length === 0 && !moderate.isError) return null

  return (
    <section
      aria-labelledby="moderation-heading"
      className="mb-4 rounded-xl border border-accent/40 bg-accent/5"
    >
      <h2 className="text-base font-semibold" id="moderation-heading">
        <button
          aria-expanded={open}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left"
          type="button"
          onClick={() => {
            setOpen((value) => !value)
          }}
        >
          <span className="min-w-0 truncate">{t('moderation.title')}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-accent px-2 py-0.5 text-sm text-primary-foreground">
              {comments.length}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
              size={18}
            />
          </span>
        </button>
      </h2>
      {moderate.isError ? (
        <p className="px-4 pb-2 text-sm text-destructive" role="alert">
          {t('moderation.error')}
        </p>
      ) : null}
      {open ? (
        <ul className="divide-y divide-border border-t border-border/60 px-4">
          {comments.map((comment) => {
            const href = publicHref(path.data, comment)
            const title = titles.get(comment.target.id)
            return (
              <li className="space-y-1 py-3 text-sm" key={comment.id}>
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
                <div className="flex gap-2 pt-1">
                  <Button
                    className="flex-1 sm:flex-none"
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
                    className="flex-1 sm:flex-none"
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
      ) : null}
    </section>
  )
}
