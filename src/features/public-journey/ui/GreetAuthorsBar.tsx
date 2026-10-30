import { MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Mobile only: a bar that stays at the bottom while reading and takes the
 * reader to the greeting form. (Following the news needs a channel that is
 * not decided yet, so it is not offered here.)
 */
export function GreetAuthorsBar() {
  const { t } = useTranslation()
  return (
    <div className="pointer-events-none sticky bottom-0 z-20 -mx-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
      <button
        className="pointer-events-auto inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft"
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
    </div>
  )
}
