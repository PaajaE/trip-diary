import { Check, X } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useDialogFocus } from '@/features/media-batch/ui/use-dialog-focus'
import { cn } from '@/shared/lib/cn'

/**
 * Building blocks of the import flow (Vybrat → Probrat → Nahrát). Sizes and
 * spacing follow docs/design/import-triage/import-triage.html.
 */

/** Full-screen column; safe areas come from env() or the dev harness. */
export function FlowScreen({
  children,
  inert,
}: {
  children: ReactNode
  inert?: boolean
}) {
  return (
    <div
      className="mx-auto flex h-full w-full max-w-[480px] flex-col"
      inert={inert}
    >
      {children}
    </div>
  )
}

export function FlowHeader({
  action,
  children,
  left,
}: {
  action?: ReactNode
  children: ReactNode
  left?: ReactNode
}) {
  return (
    <div className="flex min-h-13 flex-none items-center gap-1 px-2">
      {left}
      <h2
        className={cn(
          'min-w-0 flex-1 truncate text-lg leading-tight font-semibold',
          left === undefined ? 'pl-3' : 'pl-1',
        )}
      >
        {children}
      </h2>
      {action}
    </div>
  )
}

export function IconButton({
  className,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      className={cn(
        'grid size-11 flex-none place-items-center rounded-xl text-foreground hover:bg-sunk',
        className,
      )}
      type="button"
      {...props}
    />
  )
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <IconButton label={t('mediaImport.flow.close')} onClick={onClick}>
      <X aria-hidden="true" size={20} />
    </IconButton>
  )
}

export function TextButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 flex-none items-center gap-1.5 rounded-xl px-2.5 text-[15px] font-semibold text-primary hover:bg-sunk',
        className,
      )}
      type="button"
      {...props}
    />
  )
}

export type FlowStep = 'pick' | 'triage' | 'upload'
const STEPS: FlowStep[] = ['pick', 'triage', 'upload']

/** The three-step indicator. `current` is the step being worked on. */
export function Steps({
  current,
  done,
}: {
  current: FlowStep | null
  done: readonly FlowStep[]
}) {
  const { t } = useTranslation()
  return (
    <ol
      aria-label={t('mediaImport.flow.stepsLabel')}
      className="flex flex-none gap-1 px-4 pt-0.5 pb-2.5"
    >
      {STEPS.map((step, index) => {
        const isDone = done.includes(step)
        const isCurrent = current === step
        return (
          <li
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'flex flex-1 items-center gap-1.5 text-[13px] font-semibold',
              isCurrent ? 'text-foreground' : 'text-muted',
            )}
            key={step}
          >
            <b
              className={cn(
                'grid size-[22px] flex-none place-items-center rounded-full border-[1.5px] text-xs',
                isCurrent &&
                  'border-primary bg-primary text-primary-foreground',
                isDone &&
                  !isCurrent &&
                  'border-primary-soft bg-primary-soft text-primary',
                !isCurrent && !isDone && 'border-border',
              )}
            >
              {isDone && !isCurrent ? (
                <Check aria-hidden="true" size={13} strokeWidth={3} />
              ) : (
                index + 1
              )}
            </b>
            {t(`mediaImport.flow.steps.${step}`)}
          </li>
        )
      })}
    </ol>
  )
}

export function FlowBody({
  center,
  children,
  className,
}: {
  center?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto px-4 pt-1.5 pb-[18px] [scrollbar-width:none]',
        center && 'text-center',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function FlowFooter({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-[5] grid flex-none gap-2 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,var(--flow-safe-bottom,env(safe-area-inset-bottom)))]">
      {children}
    </div>
  )
}

const BUTTON =
  'flex w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold border border-transparent disabled:pointer-events-none disabled:opacity-50'

export function PrimaryButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        BUTTON,
        'min-h-[52px] bg-primary text-primary-foreground active:bg-primary/85',
        className,
      )}
      type="button"
      {...props}
    />
  )
}

export function SecondaryButton({
  className,
  small,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { small?: boolean }) {
  return (
    <button
      className={cn(
        BUTTON,
        'border-border bg-surface text-foreground active:bg-sunk',
        small ? 'min-h-11 text-[15px]' : 'min-h-[52px]',
        className,
      )}
      type="button"
      {...props}
    />
  )
}

export function QuietButton({
  className,
  danger,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button
      className={cn(
        BUTTON,
        'min-h-11 bg-transparent',
        danger ? 'text-destructive' : 'text-primary',
        className,
      )}
      type="button"
      {...props}
    />
  )
}

export function LinkButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'min-h-11 px-1 text-sm font-semibold text-primary underline underline-offset-[3px]',
        className,
      )}
      type="button"
      {...props}
    />
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-xs font-semibold tracking-[0.1em] text-accent-strong uppercase">
      {children}
    </p>
  )
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.01em] text-balance">
      {children}
    </h1>
  )
}

export function Lead({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p className={cn('mt-1.5 text-[15px] text-muted', className)}>{children}</p>
  )
}

export function Chip({
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-sm font-semibold text-foreground active:bg-sunk',
        className,
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

export function Banner({
  children,
  icon,
  title,
  tone = 'warn',
}: {
  children?: ReactNode
  icon: ReactNode
  title: string
  tone?: 'error' | 'info' | 'warn'
}) {
  return (
    <div
      className={cn(
        'mb-3.5 flex gap-3 rounded-2xl border p-3.5',
        tone === 'warn' && 'border-warn/35 bg-warn-soft',
        tone === 'info' && 'border-transparent bg-primary-soft',
        tone === 'error' && 'border-transparent bg-accent-soft',
      )}
      role="status"
    >
      <span
        className={cn(
          'mt-0.5 flex-none',
          tone === 'warn' && 'text-warn',
          tone === 'info' && 'text-primary',
          tone === 'error' && 'text-accent-strong',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <b className="block text-[15px] font-semibold">{title}</b>
        {children}
      </div>
    </div>
  )
}

export function ProgressBar({
  hold,
  label,
  max,
  value,
}: {
  hold?: boolean
  label: string
  max: number
  value: number
}) {
  const fraction = max <= 0 ? 0 : Math.min(1, Math.max(0, value / max))
  return (
    <div
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={0}
      aria-valuenow={value}
      className="h-2 overflow-hidden rounded-full border border-border bg-sunk"
      role="progressbar"
    >
      <i
        className={cn(
          'block h-full rounded-full',
          hold ? 'bg-warn' : 'bg-primary',
        )}
        style={{ width: `${String(Math.round(fraction * 100))}%` }}
      />
    </div>
  )
}

export function StatTile({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="min-h-[54px] rounded-2xl border border-border bg-surface px-3 py-1.5">
      <b className="block text-[22px] leading-[1.15] font-semibold tabular-nums">
        {value}
      </b>
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  )
}

export function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className="relative h-11 w-[59px] flex-none rounded-full"
      onClick={() => {
        onChange(!checked)
      }}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'absolute top-[6.5px] left-1 h-[31px] w-[51px] rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-border',
        )}
      />
      <span
        className={cn(
          'absolute top-[8.5px] left-1.5 size-[27px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}

/** Bottom sheet over the current screen; Esc and the scrim close it. */
export function Sheet({
  children,
  onClose,
  title,
}: {
  children: ReactNode
  onClose: () => void
  title: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogFocus(ref)
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const { t } = useTranslation()
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end">
      <button
        aria-label={t('mediaImport.flow.close')}
        className="absolute inset-0 border-0 bg-black/55 p-0"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="relative mx-auto grid w-full max-w-[480px] gap-3 rounded-t-3xl bg-surface px-4 pt-2.5 pb-[max(1rem,var(--flow-safe-bottom,env(safe-area-inset-bottom)))] shadow-[0_-10px_30px_rgb(0_0_0/0.18)] outline-none"
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <i className="mx-auto mb-1 block h-[5px] w-10 rounded-sm bg-border" />
        <h2 className="text-xl leading-tight font-semibold" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
