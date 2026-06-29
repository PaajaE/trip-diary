import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button'

interface CopyShareLinkProps {
  className?: string
  label?: string
  onCopy: () => Promise<void> | void
}

export function CopyShareLink({
  className,
  label,
  onCopy,
}: CopyShareLinkProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const shareLabel = label ?? t('reader.share')

  return (
    <Button
      className={className}
      onClick={() => {
        void Promise.resolve(onCopy()).then(() => {
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
      {copied ? t('reader.linkCopied') : shareLabel}
    </Button>
  )
}
