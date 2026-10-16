import { Ellipsis } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { WorkspaceDialog } from '@/features/journey-workspace/ui/WorkspaceDialog'

export interface MenuAction {
  key: string
  label: string
  onSelect: () => void
}

/**
 * One "..." button that opens a bottom sheet (centred dialog on wide screens)
 * with a list of actions. Selecting an action closes the sheet first.
 */
export function OverflowMenu({
  actions,
  className = '',
  description,
  label,
  name,
}: {
  actions: MenuAction[]
  className?: string
  /** Optional short line shown above the actions. */
  description?: ReactNode
  /** Accessible name of the trigger; defaults to "More actions: name". */
  label?: string
  /** Title of the sheet. */
  name: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (actions.length === 0) return null
  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label ?? t('workspace.moreActionsFor', { name })}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted hover:bg-surface active:bg-surface ${className}`}
        type="button"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Ellipsis aria-hidden="true" size={20} />
      </button>
      {open ? (
        <WorkspaceDialog
          title={name}
          onClose={() => {
            setOpen(false)
          }}
        >
          {description !== undefined ? (
            <p className="mt-1 text-sm text-muted">{description}</p>
          ) : null}
          <ul className="mt-2 -mx-2">
            {actions.map((action) => (
              <li key={action.key}>
                <button
                  className="flex min-h-12 w-full items-center rounded-xl px-3 text-left font-medium hover:bg-surface active:bg-surface"
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    action.onSelect()
                  }}
                >
                  {action.label}
                </button>
              </li>
            ))}
          </ul>
        </WorkspaceDialog>
      ) : null}
    </>
  )
}
