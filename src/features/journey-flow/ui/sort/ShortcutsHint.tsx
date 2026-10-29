import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

export type ShortcutKey =
  | 'close'
  | 'compare'
  | 'fullscreen'
  | 'keep'
  | 'move'
  | 'partner'
  | 'star'
  | 'swap'
  | 'trash'
  | 'undo'
  | 'zoom'

const KEYS: Record<ShortcutKey, readonly string[]> = {
  close: ['Esc'],
  compare: ['C'],
  fullscreen: ['F'],
  keep: ['N'],
  move: ['M'],
  partner: ['[', ']'],
  star: ['S'],
  swap: ['Tab'],
  trash: ['K'],
  undo: ['Z'],
  zoom: ['+'],
}

const SORT_SHORTCUTS: readonly ShortcutKey[] = [
  'trash',
  'keep',
  'star',
  'compare',
  'zoom',
  'undo',
  'move',
  'fullscreen',
  'partner',
  'swap',
  'close',
]

/**
 * The keyboard shortcuts of the sorting screens, always listed where a
 * keyboard is likely (fine pointer). Every action also has a button.
 */
export function ShortcutsHint({
  className,
  keys = SORT_SHORTCUTS,
}: {
  className?: string
  keys?: readonly ShortcutKey[]
}) {
  const { t } = useTranslation()
  return (
    <ul
      aria-label={t('flow.sort.shortcutsLabel')}
      className={cn(
        'hidden flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-white/70 sm:[@media(hover:hover)_and_(pointer:fine)]:flex',
        className,
      )}
      data-testid="sort-shortcuts"
    >
      {keys.map((key) => (
        <li className="flex items-center gap-1" key={key}>
          {KEYS[key].map((label) => (
            <kbd
              className="rounded border border-white/30 px-1 font-sans text-[11px] font-semibold text-white"
              key={label}
            >
              {label}
            </kbd>
          ))}
          <span>{t(`flow.sort.key.${key}`)}</span>
        </li>
      ))}
    </ul>
  )
}
