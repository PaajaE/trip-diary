import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Heart, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  addContentComment,
  deleteContentComment,
  getEngagementSummary,
  hideContentComment,
  toggleContentHeart,
  updateContentComment,
} from '@/entities/engagement/api/engagement.repository'
import type { ContentTarget } from '@/entities/engagement/model/engagement'
import { useSession } from '@/features/auth/session'
import { storeAuthReturnPath } from '@/features/auth/session/auth-return'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'

interface ContentEngagementProps {
  className?: string
  compact?: boolean
  target: ContentTarget
  tone?: 'default' | 'inverse'
}

export function ContentEngagement({
  className,
  compact = false,
  target,
  tone = 'default',
}: ContentEngagementProps) {
  const { t } = useTranslation()
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState('')

  const queryKey = ['engagement', target.type, target.id, user?.id ?? 'anon']
  const engagementQuery = useQuery({
    queryFn: () => getEngagementSummary(target, user?.id ?? null),
    queryKey,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['engagement', target.type, target.id] })
  }

  const heartMutation = useMutation({
    mutationFn: () => toggleContentHeart(target),
    onSuccess: invalidate,
  })

  const commentMutation = useMutation({
    mutationFn: (body: string) => addContentComment(target, body),
    onSuccess: () => {
      setDraft('')
      invalidate()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ body, commentId }: { body: string; commentId: string }) =>
      updateContentComment(commentId, body),
    onSuccess: () => {
      setEditingId(null)
      setEditingBody('')
      invalidate()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteContentComment,
    onSuccess: invalidate,
  })

  const hideMutation = useMutation({
    mutationFn: hideContentComment,
    onSuccess: invalidate,
  })

  if (engagementQuery.isPending) {
    return (
      <p className={cn('text-sm text-muted', className)} role="status">
        {t('engagement.loading')}
      </p>
    )
  }

  if (engagementQuery.isError || engagementQuery.data === undefined) {
    return null
  }

  const engagement = engagementQuery.data

  function requireSignIn() {
    if (typeof window !== 'undefined') {
      storeAuthReturnPath(window.location.pathname + window.location.search)
    }
  }

  const inverse = tone === 'inverse'

  return (
    <section className={cn(compact ? 'space-y-3' : 'space-y-5', className)}>
      <div className="flex flex-wrap items-center gap-3">
        {user === null ? (
          <Link
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold',
              inverse
                ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                : 'border-border bg-surface text-primary hover:bg-white',
            )}
            onClick={requireSignIn}
            to="/sign-in"
          >
            <Heart aria-hidden="true" size={16} />
            {t('engagement.heartCount', { count: engagement.heartCount })}
          </Link>
        ) : (
          <button
            aria-label={t('engagement.heartAction')}
            aria-pressed={engagement.viewerHasHearted}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors',
              engagement.viewerHasHearted
                ? inverse
                  ? 'border-white bg-white text-black'
                  : 'border-primary bg-primary text-primary-foreground'
                : inverse
                  ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                  : 'border-border bg-surface text-foreground hover:bg-white',
            )}
            disabled={heartMutation.isPending}
            onClick={() => {
              void heartMutation.mutate()
            }}
            type="button"
          >
            <Heart
              aria-hidden="true"
              className={engagement.viewerHasHearted ? 'fill-current' : undefined}
              size={16}
            />
            {t('engagement.heartCount', { count: engagement.heartCount })}
          </button>
        )}
        {!compact ? (
          <span className="inline-flex items-center gap-2 text-sm text-muted">
            <MessageCircle aria-hidden="true" size={16} />
            {t('engagement.commentCount', { count: engagement.comments.length })}
          </span>
        ) : null}
      </div>

      {!compact ? (
        <>
          {user === null ? (
            <p className="text-sm text-muted">
              {t('engagement.signInToComment')}{' '}
              <Link
                className="font-semibold text-primary hover:underline"
                onClick={requireSignIn}
                to="/sign-in"
              >
                {t('home.signIn')}
              </Link>
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (draft.trim() === '') {
                  return
                }
                void commentMutation.mutate(draft)
              }}
            >
              <label className="block text-sm font-medium">
                {t('engagement.addComment')}
                <textarea
                  className="mt-2 min-h-24 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base leading-7"
                  onChange={(event) => {
                    setDraft(event.target.value)
                  }}
                  placeholder={t('engagement.commentPlaceholder')}
                  value={draft}
                />
              </label>
              <Button disabled={commentMutation.isPending || draft.trim() === ''} type="submit">
                {t('engagement.postComment')}
              </Button>
            </form>
          )}

          {engagement.comments.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-surface px-5 py-4 text-sm text-muted">
              {t('engagement.commentsEmpty')}
            </p>
          ) : (
            <ul className="space-y-3">
              {engagement.comments.map((comment) => (
                <li
                  className="rounded-2xl border border-border bg-surface px-5 py-4 shadow-soft"
                  key={comment.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{comment.authorName}</p>
                      <p className="text-xs text-muted">
                        {new Date(comment.createdAt).toLocaleString('cs')}
                      </p>
                    </div>
                    {comment.hiddenAt !== null ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-900">
                        {t('engagement.hidden')}
                      </span>
                    ) : null}
                  </div>
                  {editingId === comment.id ? (
                    <form
                      className="mt-3 space-y-3"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void updateMutation.mutate({
                          body: editingBody,
                          commentId: comment.id,
                        })
                      }}
                    >
                      <textarea
                        className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                        onChange={(event) => {
                          setEditingBody(event.target.value)
                        }}
                        value={editingBody}
                      />
                      <div className="flex gap-2">
                        <Button className="px-3 py-2 text-xs" type="submit">
                          {t('engagement.saveComment')}
                        </Button>
                        <Button
                          className="px-3 py-2 text-xs"
                          onClick={() => {
                            setEditingId(null)
                          }}
                          type="button"
                          variant="secondary"
                        >
                          {t('engagement.cancelEdit')}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
                      {comment.body}
                    </p>
                  )}
                  {editingId === comment.id ? null : (
                    <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
                      {comment.isOwn ? (
                        <>
                          <button
                            className="text-primary hover:underline"
                            onClick={() => {
                              setEditingId(comment.id)
                              setEditingBody(comment.body)
                            }}
                            type="button"
                          >
                            {t('engagement.editComment')}
                          </button>
                          <button
                            className="text-destructive hover:underline"
                            onClick={() => {
                              if (!window.confirm(t('engagement.deleteConfirm'))) {
                                return
                              }
                              void deleteMutation.mutate(comment.id)
                            }}
                            type="button"
                          >
                            {t('engagement.deleteComment')}
                          </button>
                        </>
                      ) : null}
                      {engagement.canModerate && comment.hiddenAt === null ? (
                        <button
                          className="text-muted hover:underline"
                          onClick={() => {
                            void hideMutation.mutate(comment.id)
                          }}
                          type="button"
                        >
                          {t('engagement.hideComment')}
                        </button>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  )
}
