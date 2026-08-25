import { Link } from '@tanstack/react-router'
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { copyText, openWhatsAppShare, shareUrl } from '@/shared/lib/share'
import { cn } from '@/shared/lib/cn'

interface ReaderChromeProps {
  backHref?: string
  backLabel?: string
  shareText: string
  shareUrl: string
  spaceHandle?: string
  title: string
  variant?: 'overlay' | 'toolbar'
}

export function ReaderChrome({
  backHref,
  backLabel,
  shareText,
  shareUrl: url,
  spaceHandle,
  title,
  variant = 'overlay',
}: ReaderChromeProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const isToolbar = variant === 'toolbar'

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-30',
        isToolbar
          ? 'reader-chrome--toolbar px-4 py-3 sm:px-6'
          : 'px-4 py-4 sm:px-6',
      )}
    >
      <div className="pointer-events-auto mx-auto flex max-w-5xl items-center justify-between gap-3">
        {backHref !== undefined ? (
          <Link
            className={cn(
              'inline-flex min-h-11 items-center text-sm font-semibold',
              isToolbar
                ? 'text-foreground hover:text-primary'
                : 'reader-chrome-link rounded-full bg-black/25 px-4 backdrop-blur-md transition hover:bg-black/35',
            )}
            to={backHref}
          >
            {backLabel ?? t('reader.backToTrip')}
          </Link>
        ) : spaceHandle === undefined ? (
          <span />
        ) : (
          <Link
            className="reader-chrome-link inline-flex min-h-10 items-center rounded-full bg-black/25 px-4 text-sm font-semibold backdrop-blur-md transition hover:bg-black/35"
            params={{ spaceHandle }}
            to="/$spaceHandle"
          >
            @{spaceHandle}
          </Link>
        )}
        <div className="relative">
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full transition',
              isToolbar
                ? 'text-foreground hover:bg-surface'
                : 'reader-chrome-link bg-black/25 backdrop-blur-md hover:bg-black/35',
            )}
            onClick={() => {
              setMenuOpen((open) => !open)
            }}
            type="button"
          >
            <Share2 aria-hidden="true" size={18} />
            <span className="sr-only">{t('reader.share')}</span>
          </button>
          {menuOpen ? (
            <>
              <button
                aria-label={t('journey.manageClose')}
                className="fixed inset-0 z-[-1] cursor-default bg-transparent"
                onClick={() => {
                  setMenuOpen(false)
                }}
                type="button"
              />
              <div
                className="absolute right-0 top-[calc(100%+0.5rem)] z-10 min-w-[14rem] overflow-hidden rounded-2xl border border-border/80 bg-surface shadow-soft"
                role="menu"
              >
                <ShareMenuItem
                  icon={MessageCircle}
                  label={t('reader.shareWhatsApp')}
                  onClick={() => {
                    openWhatsAppShare(shareText)
                    setMenuOpen(false)
                  }}
                />
                <ShareMenuItem
                  icon={Share2}
                  label={t('reader.shareSystem')}
                  onClick={() => {
                    void shareUrl(url, title).catch(() => copyText(url))
                    setMenuOpen(false)
                  }}
                />
                <ShareMenuItem
                  icon={copied ? Check : Copy}
                  label={copied ? t('reader.linkCopied') : t('reader.copyLink')}
                  onClick={() => {
                    void copyText(url).then(() => {
                      setCopied(true)
                      window.setTimeout(() => {
                        setCopied(false)
                      }, 2000)
                    })
                    setMenuOpen(false)
                  }}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ShareMenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Share2
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'flex w-full min-h-11 items-center gap-3 px-4 py-3 text-left text-sm font-semibold',
        'transition hover:bg-background',
      )}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <Icon aria-hidden="true" size={17} />
      {label}
    </button>
  )
}
