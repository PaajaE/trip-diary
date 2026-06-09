import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string | undefined
  label: string
}

export function Input({ className, error, id, label, ...props }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <label className="block text-sm font-medium" htmlFor={inputId}>
      {label}
      <input
        aria-describedby={error === undefined ? undefined : errorId}
        aria-invalid={error === undefined ? undefined : true}
        className={cn(
          'mt-2 min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base font-normal outline-none transition-colors focus:border-primary',
          error === undefined ? null : 'border-destructive',
          className,
        )}
        id={inputId}
        {...props}
      />
      {error === undefined ? null : (
        <span className="mt-2 block text-sm text-destructive" id={errorId}>
          {error}
        </span>
      )}
    </label>
  )
}
