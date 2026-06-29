import { useTranslation } from 'react-i18next'

interface PublicRouteMessageProps {
  children: React.ReactNode
  error?: boolean
}

export function PublicRouteMessage({
  children,
  error = false,
}: PublicRouteMessageProps) {
  return (
    <main
      className={`mx-auto max-w-3xl px-5 py-16 ${error ? 'text-destructive' : 'text-muted'}`}
      role={error ? 'alert' : 'status'}
    >
      {children}
    </main>
  )
}

export function PublicRouteLoading({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation()
  return <PublicRouteMessage>{t(labelKey)}</PublicRouteMessage>
}

export function PublicRouteNotFound({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation()
  return <PublicRouteMessage>{t(labelKey)}</PublicRouteMessage>
}

export function PublicRouteError({ labelKey }: { labelKey: string }) {
  const { t } = useTranslation()
  return <PublicRouteMessage error>{t(labelKey)}</PublicRouteMessage>
}
