import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

const BODY_MIN_HEIGHT_PX = 160
const TITLE_MAX_LENGTH = 160

const TITLE_CLASS =
  'reader-display text-[clamp(1.85rem,5vw,3.15rem)] leading-[1.05] tracking-[-0.04em]'

const STORY_CLASS = 'prose-reader text-lg leading-[1.8] text-foreground/90'

interface MomentInlineTextFieldsProps {
  body: string
  className?: string
  disabled?: boolean
  editing: boolean
  /** Rendered between title and body (public-aligned: date/location). */
  metaSlot?: ReactNode
  onBodyChange: (value: string) => void
  onTitleChange: (value: string) => void
  title: string
}

export function MomentInlineTextFields({
  body,
  className,
  disabled = false,
  editing,
  metaSlot,
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

  const titleNode = editing ? (
    <>
      <label className="sr-only" htmlFor={titleId}>
        {t('entry.title')}
      </label>
      <input
        autoComplete="off"
        className={cn(
          TITLE_CLASS,
          'w-full min-w-0 scroll-mt-[calc(4.75rem+env(safe-area-inset-top))] rounded-md bg-transparent px-1 -mx-1 outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary/20',
        )}
        disabled={disabled}
        id={titleId}
        maxLength={TITLE_MAX_LENGTH}
        onChange={(event) => {
          onTitleChange(event.target.value)
        }}
        onFocus={(event) => {
          const field = event.currentTarget
          window.setTimeout(() => {
            field.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }, 50)
        }}
        placeholder={t('entry.titlePlaceholder')}
        ref={titleRef}
        value={title}
      />
    </>
  ) : (
    <h1 className={TITLE_CLASS}>{title}</h1>
  )

  const bodyNode = editing ? (
    <>
      <label className="sr-only" htmlFor={bodyId}>
        {t('entry.body')}
      </label>
      <textarea
        className={cn(
          STORY_CLASS,
          'min-h-40 w-full scroll-mt-[calc(4.75rem+env(safe-area-inset-top))] resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-primary/20 rounded-md px-1 -mx-1',
        )}
        disabled={disabled}
        id={bodyId}
        onChange={(event) => {
          onBodyChange(event.target.value)
          autosizeTextarea(event.currentTarget, BODY_MIN_HEIGHT_PX)
        }}
        onFocus={(event) => {
          const field = event.currentTarget
          window.setTimeout(() => {
            field.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }, 50)
        }}
        onKeyDown={handleBodyKeyDown}
        placeholder={t('entry.bodyPlaceholder')}
        ref={bodyRef}
        value={body}
      />
    </>
  ) : body.trim() === '' ? null : (
    <p className={cn(STORY_CLASS, 'whitespace-pre-wrap')}>{body}</p>
  )

  if (metaSlot !== undefined) {
    return (
      <div className={className}>
        <div className="mt-3">{titleNode}</div>
        {metaSlot}
        {bodyNode === null ? null : <div className="mt-8">{bodyNode}</div>}
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {titleNode}
      {bodyNode}
    </div>
  )
}

function autosizeTextarea(element: HTMLTextAreaElement, minHeightPx: number) {
  element.style.height = 'auto'
  element.style.height = `${Math.max(element.scrollHeight, minHeightPx).toString()}px`
}
