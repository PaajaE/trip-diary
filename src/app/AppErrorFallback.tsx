import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button'

export interface AppErrorFallbackProps {
  error: Error
  onReload: () => void
  showDevDetails?: boolean
}

export function AppErrorFallback({
  error,
  onReload,
  showDevDetails = import.meta.env.DEV,
}: AppErrorFallbackProps) {
  const { t } = useTranslation()

  return (
    <main
      className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-5 py-16"
      role="alert"
    >
      <h1 className="text-2xl font-semibold text-foreground">
        {t('app.errorBoundary.title')}
      </h1>
      <p className="text-muted">{t('app.errorBoundary.description')}</p>
      {showDevDetails ? (
        <details className="rounded-md border border-border bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-medium text-foreground">
            {t('app.errorBoundary.devDetails')}
          </summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-destructive">
            {error.message}
            {error.stack !== undefined && error.stack.length > 0
              ? `\n\n${error.stack}`
              : null}
          </pre>
        </details>
      ) : null}
      <div>
        <Button onClick={onReload} type="button">
          {t('app.errorBoundary.reload')}
        </Button>
      </div>
    </main>
  )
}
