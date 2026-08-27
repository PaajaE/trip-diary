import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/shared/lib/cn'

const BODY_MIN_HEIGHT_PX = 160
const TITLE_MAX_LENGTH = 160

interface MomentInlineTextFieldsProps {
  body: string
  disabled?: boolean
  editing: boolean
  onBodyChange: (value: string) => void
  onTitleChange: (value: string) => void
  title: string
}

export function MomentInlineTextFields({
  body,
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
    <div className="mt-6 space-y-6">
      {editing ? (
        <>
          <label className="sr-only" htmlFor={titleId}>
            {t('entry.title')}
          </label>
          <input
            autoComplete="off"
            className="reader-display w-full min-w-0 bg-transparent text-[clamp(1.85rem,5vw,3rem)] leading-[1.05] tracking-[-0.04em] outline-none placeholder:text-muted/70 focus:ring-0"
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
      ) : (
        <>
          <h1 className="reader-display text-[clamp(1.85rem,5vw,3rem)] leading-[1.05] tracking-[-0.04em]">
            {title}
          </h1>
          {body.trim() === '' ? null : (
            <p className="prose-reader max-w-[40rem] whitespace-pre-wrap text-lg leading-[1.8]">
              {body}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function autosizeTextarea(element: HTMLTextAreaElement, minHeightPx: number) {
  element.style.height = 'auto'
  element.style.height = `${Math.max(element.scrollHeight, minHeightPx).toString()}px`
}
