import { useEffect } from 'react'
import { i18n } from '@/app/i18n'
import { useSession } from '@/features/auth/session'

export function LocaleSync() {
  const { profile } = useSession()

  useEffect(() => {
    const locale = profile?.preferredLocale
    if (locale === 'cs' || locale === 'en') {
      void i18n.changeLanguage(locale)
    }
  }, [profile?.preferredLocale])

  return null
}
