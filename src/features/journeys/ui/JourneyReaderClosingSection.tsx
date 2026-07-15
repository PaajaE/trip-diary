import { Link } from '@tanstack/react-router'
import { Copy, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/features/auth/session'
import { storeAuthReturnPath } from '@/features/auth/session/auth-return'
import { copyText, shareUrl } from '@/shared/lib/share'
import { Button } from '@/shared/ui/Button'

interface JourneyReaderClosingSectionProps {
  shareUrl: string
  spaceHandle: string
  title: string
}

export function JourneyReaderClosingSection({
  shareUrl: url,
  spaceHandle,
  title,
}: JourneyReaderClosingSectionProps) {
  const { t } = useTranslation()
  const { user } = useSession()
  const [copied, setCopied] = useState(false)

  const actions = [
    {
      id: 'share',
      label: t('reader.closingShareTrip'),
      onClick: () => {
        void shareUrl(url, title).catch(() => copyText(url))
      },
    },
    {
      id: 'copy',
      label: copied ? t('reader.linkCopied') : t('reader.copyLink'),
      onClick: () => {
        void copyText(url).then(() => {
          setCopied(true)
          window.setTimeout(() => {
            setCopied(false)
          }, 2000)
        })
      },
    },
  ] as const

  return (
    <section
      aria-labelledby="reader-closing-heading"
      className="scroll-mt-24 border-t border-border/70 py-14 sm:py-20"
    >
      <div>
        <p className="text-sm font-medium tracking-[0.16em] text-accent uppercase">
          {t('reader.closingEyebrow')}
        </p>
        <h2
          className="reader-display mt-3 text-3xl sm:text-4xl"
          id="reader-closing-heading"
        >
          {t('reader.closingTitle')}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
          {t('reader.closingDescription')}
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button onClick={actions[0].onClick} type="button" variant="primary">
          <Share2 aria-hidden="true" size={16} />
          {actions[0].label}
        </Button>
        <Button onClick={actions[1].onClick} type="button" variant="secondary">
          <Copy aria-hidden="true" size={16} />
          {actions[1].label}
        </Button>
        <Link
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border bg-surface px-5 text-sm font-semibold text-foreground transition-colors hover:bg-white active:bg-background"
          params={{ spaceHandle }}
          to="/$spaceHandle"
        >
          {t('reader.closingVisitSpace', { handle: spaceHandle })}
        </Link>
        {user === null ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-semibold text-foreground transition-colors hover:bg-surface"
            onClick={() => {
              storeAuthReturnPath(
                `${window.location.pathname}${window.location.search}`,
              )
            }}
            to="/sign-in"
          >
            {t('reader.closingSignInOptional')}
          </Link>
        ) : null}
      </div>
    </section>
  )
}
