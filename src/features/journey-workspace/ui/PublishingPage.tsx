import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  getJourneyPublishing,
  PUBLISH_DELAY_OPTIONS,
  updateJourneyPublishing,
} from '@/entities/journey/api/journey-publishing.repository'
import { journeyQueryKeys } from '@/entities/journey/api/journey-query-keys'
import { cn } from '@/shared/lib/cn'
import { useToast } from '@/shared/ui/use-toast'

const publishingKey = (journeyId: string) =>
  [...journeyQueryKeys.detail(journeyId), 'publishing'] as const

/**
 * "Publishing and privacy": who can read the journey, how long readers wait
 * for new content, and what is published right now. The database decides who
 * may change it.
 */
export function PublishingPage({ journeyId }: { journeyId: string }) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryFn: () => getJourneyPublishing(journeyId),
    queryKey: publishingKey(journeyId),
  })
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateJourneyPublishing>[1]) =>
      updateJourneyPublishing(journeyId, patch),
    onError: () => {
      showToast({ message: t('publishing.saveFailed'), variant: 'error' })
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: journeyQueryKeys.detail(journeyId),
      })
      await queryClient.invalidateQueries({
        queryKey: journeyQueryKeys.publicPaths(journeyId),
      })
    },
    onSuccess: () => {
      showToast({ message: t('publishing.saved') })
    },
  })

  if (query.isPending) {
    return <p className="text-sm text-muted">{t('publishing.loading')}</p>
  }
  const data = query.data
  if (data === null || data === undefined) {
    return <p className="text-sm text-muted">{t('publishing.unavailable')}</p>
  }
  const choice = (active: boolean) =>
    cn(
      'flex min-h-11 w-full items-start gap-3 rounded-xl border p-3 text-left text-sm',
      active ? 'border-primary bg-primary-soft' : 'border-border bg-surface',
    )
  return (
    <div className="space-y-8" data-testid="publishing-page">
      <section aria-labelledby="pub-visibility" className="space-y-3">
        <h2 className="text-lg font-semibold" id="pub-visibility">
          {t('publishing.visibility.title')}
        </h2>
        <div
          className="space-y-2"
          role="radiogroup"
          aria-labelledby="pub-visibility"
        >
          {(['private', 'public'] as const).map((value) => (
            <button
              aria-checked={data.visibility === value}
              className={choice(data.visibility === value)}
              disabled={save.isPending}
              key={value}
              role="radio"
              type="button"
              onClick={() => {
                if (data.visibility !== value) {
                  save.mutate({ visibility: value })
                }
              }}
            >
              <span className="min-w-0">
                <span className="block font-semibold">
                  {t(`publishing.visibility.${value}.label`)}
                </span>
                <span className="block text-muted">
                  {t(`publishing.visibility.${value}.hint`)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="pub-delay" className="space-y-3">
        <h2 className="text-lg font-semibold" id="pub-delay">
          {t('publishing.delay.title')}
        </h2>
        <p className="text-sm text-muted">{t('publishing.delay.hint')}</p>
        <label className="block text-sm font-medium" htmlFor="pub-delay-select">
          {t('publishing.delay.label')}
        </label>
        <select
          className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          disabled={save.isPending || data.visibility !== 'public'}
          id="pub-delay-select"
          value={data.publishDelayDays}
          onChange={(event) => {
            save.mutate({ publishDelayDays: Number(event.target.value) })
          }}
        >
          {PUBLISH_DELAY_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {days === 0
                ? t('publishing.delay.none')
                : t('publishing.delay.days', { count: days })}
            </option>
          ))}
        </select>
      </section>

      <section aria-labelledby="pub-now" className="space-y-2">
        <h2 className="text-lg font-semibold" id="pub-now">
          {t('publishing.now.title')}
        </h2>
        <p className="text-sm" data-testid="publishing-counts">
          {t('publishing.now.counts', {
            published: data.momentCounts.published,
            total: data.momentCounts.total,
          })}
        </p>
        <p className="text-sm text-muted">{t('publishing.now.explain')}</p>
      </section>

      <section aria-labelledby="pub-privacy" className="space-y-2">
        <h2 className="text-lg font-semibold" id="pub-privacy">
          {t('publishing.privacy.title')}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>{t('publishing.privacy.home')}</li>
          <li>{t('publishing.privacy.location')}</li>
        </ul>
      </section>
    </div>
  )
}
