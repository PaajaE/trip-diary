import { Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { JourneySearch } from '@/features/journey-workspace/ui/JourneySearch'
import { cn } from '@/shared/lib/cn'
import { buttonVariants } from '@/shared/ui/button-variants'

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable)
  )
}

/**
 * "Search" button of the owner frame header (icon only below `sm`) plus the
 * global Ctrl/Cmd+K shortcut. The shortcut is ignored while typing in a field
 * and while any other dialog is open.
 */
export function JourneySearchButton({ journeyId }: { journeyId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const openRef = useRef(open)
  useEffect(() => {
    openRef.current = open
  })
  const close = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k') return
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey)
        return
      if (isTyping(event.target)) return
      if (openRef.current) return
      if (document.querySelector('[role="dialog"]') !== null) return
      event.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <>
      <button
        aria-keyshortcuts="Control+K Meta+K"
        aria-label={t('search.open')}
        className={cn(buttonVariants({ variant: 'secondary' }), 'px-3 sm:px-5')}
        title={t('search.openHint')}
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Search aria-hidden="true" size={18} />
        <span className="hidden sm:inline">{t('search.open')}</span>
      </button>
      {open ? <JourneySearch journeyId={journeyId} onClose={close} /> : null}
    </>
  )
}
