import { MessageCircle, Rss } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Mobile only: a bar that stays at the bottom while reading: greet the
 * authors (jumps to the comments) and follow the news (the journey's Atom
 * feed, a static file; no sign-up, no address collected).
 */
export function GreetAuthorsBar({ feedHref }: { feedHref?: string }) {
  const { t } = useTranslation()
  return (
    <div className="pointer-events-none sticky bottom-0 z-20 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
      <div className="pointer-events-auto flex gap-2">
        <button
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft"
          data-testid="greet-authors"
          type="button"
          onClick={() => {
            document.getElementById('comments')?.scrollIntoView({
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 'auto'
                : 'smooth',
              block: 'start',
            })
          }}
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          {t('publicJourney.greetAuthors')}
        </button>
        {feedHref === undefined ? null : (
          <a
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-soft"
            data-testid="follow-news"
            href={feedHref}
          >
            <Rss aria-hidden="true" className="size-4" />
            {t('publicJourney.followNews')}
          </a>
        )}
      </div>
    </div>
  )
}
