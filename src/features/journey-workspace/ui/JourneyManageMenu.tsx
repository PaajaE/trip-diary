import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'
import { AnchoredPanel } from '@/shared/ui/AnchoredPanel'

const MENU_ITEM_CLASS =
  'flex min-h-11 items-center rounded-sm px-3 text-sm font-semibold hover:bg-background focus-visible:bg-background focus-visible:outline'

export type ManageTab = 'members' | 'trash'

/**
 * "Journey management" menu button at the end of the journey tabs: members and
 * trash live here instead of next to the main work flow. The button gets
 * `aria-current` while one of its pages is open. Keyboard: Arrow keys, Home and
 * End move between items, Escape closes and returns focus to the button.
 */
export function JourneyManageMenu({
  buttonClassName,
  current,
  journeyId,
}: {
  buttonClassName: string
  current: ManageTab | null
  journeyId: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    setOpen(false)
  }, [])

  // Move focus to the first item when the menu opens.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }, [open])

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    )
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    let next: number | null = null
    if (event.key === 'ArrowDown') next = (index + 1) % items.length
    else if (event.key === 'ArrowUp')
      next = index <= 0 ? items.length - 1 : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next === null) return
    event.preventDefault()
    items[next]?.focus()
  }

  const itemClass = (key: ManageTab) =>
    cn(MENU_ITEM_CLASS, current === key && 'bg-primary/10 text-primary')

  return (
    <>
      <button
        aria-current={current === null ? undefined : 'page'}
        aria-expanded={open}
        aria-haspopup="menu"
        className={buttonClassName}
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((value) => !value)
        }}
      >
        {t('owner.tabs.manage')}
        <ChevronDown aria-hidden="true" size={14} />
      </button>
      <AnchoredPanel
        anchorRef={triggerRef}
        className="rounded-xl border border-border/80 bg-surface p-2 shadow-soft"
        open={open}
        role="menu"
        onClose={close}
      >
        <div ref={listRef} role="presentation" onKeyDown={onKeyDown}>
          <Link
            aria-current={current === 'members' ? 'page' : undefined}
            className={itemClass('members')}
            params={{ journeyId }}
            role="menuitem"
            to="/j/$journeyId/members"
            onClick={close}
          >
            {t('owner.tabs.members')}
          </Link>
          <Link
            aria-current={current === 'trash' ? 'page' : undefined}
            className={itemClass('trash')}
            params={{ journeyId }}
            role="menuitem"
            to="/j/$journeyId/trash"
            onClick={close}
          >
            {t('owner.tabs.trash')}
          </Link>
        </div>
      </AnchoredPanel>
    </>
  )
}
