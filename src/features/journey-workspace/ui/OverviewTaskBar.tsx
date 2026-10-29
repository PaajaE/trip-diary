import { useTranslation } from 'react-i18next'
import type { WorkspaceTasks } from '@/features/journey-workspace/model/workspace-tasks'
import { cn } from '@/shared/lib/cn'

export type TaskId =
  | 'noText'
  | 'noTime'
  | 'suggestions'
  | 'toCull'
  | 'unreviewed'

/**
 * "What to do next": chips with counts computed from the data. A chip with
 * nothing left turns green and stops being a button target.
 */
export function OverviewTaskBar({
  onOpen,
  tasks,
}: {
  onOpen: (task: TaskId) => void
  tasks: WorkspaceTasks
}) {
  const { t } = useTranslation()
  const items: { count: number; id: TaskId; label: string }[] = [
    {
      count: tasks.unreviewed.count,
      id: 'unreviewed',
      label: t('workspace.tasks.unreviewed'),
    },
    {
      count: tasks.suggestions.count,
      id: 'suggestions',
      label: t('workspace.tasks.suggestions'),
    },
    {
      count: tasks.daysWithoutText.count,
      id: 'noText',
      label: t('workspace.tasks.noText'),
    },
    {
      count: tasks.daysToCull.count,
      id: 'toCull',
      label: t('workspace.tasks.toCull'),
    },
    {
      count: tasks.mediaWithoutTime.count,
      id: 'noTime',
      label: t('workspace.tasks.noTime'),
    },
  ]
  return (
    <ul
      aria-label={t('workspace.tasks.label')}
      className="no-scrollbar m-0 flex list-none gap-2.5 overflow-x-auto border-b border-border bg-sunk px-4 py-3 sm:px-5"
    >
      {items.map((item) => (
        <li className="shrink-0" key={item.id}>
          <button
            className={cn(
              'flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-[13px] whitespace-nowrap text-foreground',
              item.count === 0 ? 'cursor-default' : 'hover:border-faint',
            )}
            data-done={item.count === 0 ? 'true' : undefined}
            data-task={item.id}
            disabled={item.count === 0}
            type="button"
            onClick={() => {
              onOpen(item.id)
            }}
          >
            <span
              className={cn(
                'inline-grid h-[22px] min-w-[22px] place-items-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                item.count === 0
                  ? 'bg-primary-soft text-primary'
                  : 'bg-accent-soft text-accent-strong',
              )}
            >
              {item.count}
            </span>
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
