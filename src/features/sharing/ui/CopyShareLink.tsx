import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/shared/ui/Button'

interface CopyShareLinkProps {
  className?: string
  label?: string
  onCopy: () => Promise<void> | void
}

export function CopyShareLink({
  className,
  label = 'Sdílet',
  onCopy,
}: CopyShareLinkProps) {
  const [copied, setCopied] = useState(false)

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
      {copied ? 'Odkaz zkopírován' : label}
    </Button>
  )
}
