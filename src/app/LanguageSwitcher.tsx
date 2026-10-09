import { useTranslation } from 'react-i18next'
import { i18n } from '@/app/i18n'
import { storeLocale, type AppLocale } from '@/app/locale-preference'
import { cn } from '@/shared/lib/cn'

const LOCALES: readonly AppLocale[] = ['cs', 'en']

export function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n: instance, t } = useTranslation()

  return (
    <div
      aria-label={t('language.label')}
      className={cn('inline-flex items-center rounded-full', className)}
      role="group"
    >
      {LOCALES.map((locale) => {
        const active = instance.language === locale
        return (
          <button
            aria-pressed={active}
            className={cn(
              'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full px-3 text-xs font-semibold tracking-wide uppercase transition-colors',
              active
                ? 'text-primary underline decoration-2 underline-offset-8'
                : 'text-muted hover:text-foreground',
            )}
            key={locale}
            lang={locale}
            onClick={() => {
              storeLocale(locale)
              void i18n.changeLanguage(locale)
            }}
            title={t(`language.${locale}`)}
            type="button"
          >
            {locale}
          </button>
        )
      })}
    </div>
  )
}
