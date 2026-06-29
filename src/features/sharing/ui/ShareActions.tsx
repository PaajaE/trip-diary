import { Check, Copy, MessageCircle, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  copyText,
  openWhatsAppShare,
  shareUrl,
} from '@/shared/lib/share'
import { Button } from '@/shared/ui/Button'

interface ShareActionsProps {
  className?: string
  shareText: string
  shareUrl: string
  title: string
}

export function ShareActions({
  className,
  shareText,
  shareUrl: url,
  title,
}: ShareActionsProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          className="sm:min-h-11"
          onClick={() => {
            openWhatsAppShare(shareText)
          }}
          variant="secondary"
        >
          <MessageCircle aria-hidden="true" size={17} />
          {t('reader.shareWhatsApp')}
        </Button>
        <Button
          className="sm:min-h-11"
          onClick={() => {
            void shareUrl(url, title).catch(() => copyText(url))
          }}
          variant="secondary"
        >
          <Share2 aria-hidden="true" size={17} />
          {t('reader.shareSystem')}
        </Button>
        <Button
          className="sm:min-h-11"
          onClick={() => {
            void copyText(url).then(() => {
              setCopied(true)
            })
          }}
          variant="secondary"
        >
          {copied ? (
            <Check aria-hidden="true" size={17} />
          ) : (
            <Copy aria-hidden="true" size={17} />
          )}
          {copied ? t('reader.linkCopied') : t('reader.copyLink')}
        </Button>
      </div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        {t('reader.shareWhatsAppHint')}
      </p>
    </div>
  )
}
