import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { momentTextColumnClass } from '@/features/journeys/ui/moment-editorial-layout'
import { cn } from '@/shared/lib/cn'

const BODY_MIN_HEIGHT_PX = 160
const TITLE_MAX_LENGTH = 160

const TITLE_CLASS =
  'reader-display text-[clamp(1.85rem,5vw,3.15rem)] leading-[1.05] tracking-[-0.04em]'

interface MomentInlineTextFieldsProps {
  actionsSlot?: ReactNode
  body: string
  className?: string
  disabled?: boolean
  editing: boolean
  onBodyChange: (value: string) => void
  onTitleChange: (value: string) => void
  title: string
}

export function MomentInlineTextFields({
  actionsSlot,
  body,
  className,
  disabled = false,
  editing,
  onBodyChange,
  onTitleChange,
  title,
}: MomentInlineTextFieldsProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const bodyId = useId()
  const titleRef = useRef<HTMLInputElement | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const bodyField = bodyRef.current
    if (bodyField === null || !editing) {
      return
    }
    autosizeTextarea(bodyField, BODY_MIN_HEIGHT_PX)
  }, [body, editing])

  function handleBodyKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.currentTarget.blur()
    }
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {editing ? (
            <>
              <label className="sr-only" htmlFor={titleId}>
                {t('entry.title')}
              </label>
              <input
                autoComplete="off"
                className={cn(
                  TITLE_CLASS,
                  'w-full min-w-0 bg-transparent outline-none placeholder:text-muted/70 focus:ring-0',
                )}
                disabled={disabled}
                id={titleId}
                maxLength={TITLE_MAX_LENGTH}
                onChange={(event) => {
                  onTitleChange(event.target.value)
                }}
                placeholder={t('entry.titlePlaceholder')}
                ref={titleRef}
                value={title}
              />
            </>
          ) : (
            <h1 className={TITLE_CLASS}>{title}</h1>
          )}
        </div>
        {actionsSlot !== undefined ? (
          <div className="shrink-0">{actionsSlot}</div>
        ) : null}
      </div>

      {editing ? (
        <>
          <label className="sr-only" htmlFor={bodyId}>
            {t('entry.body')}
          </label>
          <textarea
            className={cn(
              'prose-reader min-h-40 w-full resize-none overflow-hidden bg-transparent text-lg leading-[1.8] outline-none placeholder:text-muted/70',
            )}
            disabled={disabled}
            id={bodyId}
            onChange={(event) => {
              onBodyChange(event.target.value)
              autosizeTextarea(event.currentTarget, BODY_MIN_HEIGHT_PX)
            }}
            onKeyDown={handleBodyKeyDown}
            placeholder={t('entry.bodyPlaceholder')}
            ref={bodyRef}
            value={body}
          />
        </>
      ) : body.trim() === '' ? null : (
        <p
          className={cn(
            momentTextColumnClass,
            'prose-reader whitespace-pre-wrap text-lg leading-[1.8] text-foreground/90',
          )}
        >
          {body}
        </p>
      )}
    </div>
  )
}

function autosizeTextarea(element: HTMLTextAreaElement, minHeightPx: number) {
  element.style.height = 'auto'
  element.style.height = `${Math.max(element.scrollHeight, minHeightPx).toString()}px`
}
