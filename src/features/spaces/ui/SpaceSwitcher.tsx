import { Check, ChevronDown, Plus, UsersRound } from 'lucide-react'
import { useId, useState } from 'react'
import type { SpaceSwitcherItem } from '@/features/spaces/model/spaces'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/lib/cn'

interface SpaceSwitcherProps {
  activeSpaceId: string
  onCreateFamily: () => void
  onSelect: (spaceId: string) => void
  spaces: SpaceSwitcherItem[]
}

export function SpaceSwitcher({
  activeSpaceId,
  onCreateFamily,
  onSelect,
  spaces,
}: SpaceSwitcherProps) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const activeSpace =
    spaces.find((space) => space.id === activeSpaceId) ?? spaces[0]

  if (activeSpace === undefined) {
    return (
      <Button className="w-full sm:w-auto" onClick={onCreateFamily}>
        <Plus aria-hidden="true" size={18} />
        Vytvořit rodinný prostor
      </Button>
    )
  }

  return (
    <div className="relative">
      <button
        aria-controls={menuId}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-3 rounded-md border border-border bg-surface px-3 text-left shadow-soft transition-colors hover:bg-white sm:w-72"
        onClick={() => {
          setOpen((current) => !current)
        }}
        type="button"
      >
        <Avatar
          className="size-8"
          label={activeSpace.name}
          src={activeSpace.avatarUrl}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {activeSpace.name}
          </span>
          <span className="block truncate text-xs text-muted">
            @{activeSpace.handle}
          </span>
        </span>
        <ChevronDown aria-hidden="true" size={18} />
      </button>

      {open ? (
        <div
          className="absolute left-0 z-20 mt-2 w-full min-w-64 rounded-md border border-border bg-surface p-2 shadow-soft"
          id={menuId}
        >
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Publikovat jako
          </p>
          {spaces.map((space) => (
            <button
              className={cn(
                'flex min-h-12 w-full items-center gap-3 rounded-sm px-3 text-left transition-colors hover:bg-background',
                space.id === activeSpaceId ? 'bg-background' : null,
              )}
              key={space.id}
              onClick={() => {
                onSelect(space.id)
                setOpen(false)
              }}
              type="button"
            >
              <Avatar
                className="size-8"
                label={space.name}
                src={space.avatarUrl}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {space.name}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {space.kind === 'family' ? (
                    <UsersRound aria-hidden="true" size={13} />
                  ) : null}
                  @{space.handle}
                </span>
              </span>
              {space.id === activeSpaceId ? (
                <Check aria-label="Aktivní prostor" size={17} />
              ) : null}
            </button>
          ))}
          <button
            className="mt-2 flex min-h-11 w-full items-center gap-2 rounded-sm border-t border-border px-3 pt-3 text-left text-sm font-semibold text-primary"
            onClick={() => {
              onCreateFamily()
              setOpen(false)
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={17} />
            Vytvořit rodinný prostor
          </button>
        </div>
      ) : null}
    </div>
  )
}
